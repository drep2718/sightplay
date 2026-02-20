import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import { parseMusicXML, parseMidiFile } from '../../utils/musicXmlParser.js';
import { midiToDisplayName } from '../../utils/noteUtils.js';
import { useStore } from '../../store/index.js';

const SUPPORTED_GUIDED = '.xml,.musicxml,.mid,.midi';
const SUPPORTED_PDF    = '.pdf';

// ─── Guided Practice ─────────────────────────────────────────────────────────

function GuidedPractice({ isPlaying, onStart, onStop, registerModeHandler }) {
  const recordAttempt = useStore(s => s.recordAttempt);

  const [parsedMusic, setParsedMusic]     = useState(null);
  const [currentColIdx, setCurrentColIdx] = useState(0);
  const [feedback, setFeedback]           = useState(null);
  const [history, setHistory]             = useState([]);
  const [session, setSession]             = useState({ at: 0, co: 0 });
  const [dragover, setDragover]           = useState(false);
  const [parseError, setParseError]       = useState(null);
  const [loading, setLoading]             = useState(false);

  const fileInputRef    = useRef(null);
  const feedbackTimeout = useRef(null);
  /**
   * Blocks re-entry while the ✓ flash is visible (prevents double-advance
   * when multiple notes from the same chord trigger handleNoteOn in quick
   * succession after the match is already satisfied).
   */
  const isAdvancing     = useRef(false);
  const S               = useRef({});
  S.current = { parsedMusic, currentColIdx, isPlaying };

  const totalCols = parsedMusic?.columns.length ?? 0;

  // ── Measure containing the current column ──────────────────────────────────
  const currentMeasureIdx = useMemo(() => {
    if (!parsedMusic?.measureColStarts?.length) return 0;
    const starts = parsedMusic.measureColStarts;
    for (let i = starts.length - 1; i >= 0; i--) {
      if (starts[i] <= currentColIdx) return i;
    }
    return 0;
  }, [parsedMusic, currentColIdx]);

  const currentMeasure    = parsedMusic?.measures[currentMeasureIdx] ?? { treble: [], bass: [], columns: [] };
  const measureColStart   = parsedMusic?.measureColStarts[currentMeasureIdx] ?? 0;

  // ── Annotated notes for both staves (colors driven by column index) ─────────
  const trebleAnnotated = useMemo(() => currentMeasure.treble.map((event, ti) => {
    const colLocalIdx = currentMeasure.columns.findIndex(c => c.trebleIdx === ti);
    const colAbs      = colLocalIdx >= 0 ? measureColStart + colLocalIdx : -1;
    return {
      midi:     event.midi[0] ?? 60,
      duration: event.duration,
      played:   colAbs >= 0 && colAbs < currentColIdx ? true : null,
      current:  colAbs === currentColIdx,
    };
  }), [currentMeasure, measureColStart, currentColIdx]);

  const bassAnnotated = useMemo(() => currentMeasure.bass.map((event, bi) => {
    const colLocalIdx = currentMeasure.columns.findIndex(c => c.bassIdx === bi);
    const colAbs      = colLocalIdx >= 0 ? measureColStart + colLocalIdx : -1;
    return {
      midi:     event.midi[0] ?? 60,
      duration: event.duration,
      played:   colAbs >= 0 && colAbs < currentColIdx ? true : null,
      current:  colAbs === currentColIdx,
    };
  }), [currentMeasure, measureColStart, currentColIdx]);

  // ── File loading ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    setParseError(null);
    setLoading(true);
    setParsedMusic(null);
    setCurrentColIdx(0);
    setFeedback(null);
    setHistory([]);
    setSession({ at: 0, co: 0 });
    isAdvancing.current = false;

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let result;
      if (ext === 'xml' || ext === 'musicxml') {
        const text = await file.text();
        result = parseMusicXML(text);
      } else if (ext === 'mid' || ext === 'midi') {
        const buffer = await file.arrayBuffer();
        result = await parseMidiFile(buffer);
      } else {
        setParseError('Unsupported type. Please use .xml, .musicxml, .mid, or .midi');
        setLoading(false);
        return;
      }

      if (!result || result.columns.length === 0) {
        setParseError('No playable notes found in the file.');
      } else {
        setParsedMusic(result);
      }
    } catch (err) {
      console.error(err);
      setParseError('Failed to parse: ' + err.message);
    }
    setLoading(false);
  }

  // ── Skip to next column (Skip button / end of piece) ─────────────────────
  const skipToNext = useCallback(() => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    isAdvancing.current = false;
    setCurrentColIdx(prev => prev + 1);
    setFeedback(null);
  }, []);

  // ── Note-on handler — Active Set pattern (Piano-Trainer style) ─────────────
  // On every note-on we read the *currently held* keys directly from the store
  // (Zustand state is updated synchronously before this callback fires).
  // This means any combination of notes physically pressed at this instant is
  // checked against the required set — no per-step accumulation, no timers.
  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if (!s.isPlaying || !s.parsedMusic) return;
    if (s.currentColIdx >= s.parsedMusic.columns.length) return;
    if (isAdvancing.current) return; // guard: already matched this column

    const col      = s.parsedMusic.columns[s.currentColIdx];
    const required = col.allMidi;

    if (!required.includes(midi)) {
      // Wrong note — penalise and let the player try again
      setFeedback('incorrect');
      setSession(p => ({ ...p, at: p.at + 1 }));
      setHistory(h => [...h.slice(-99), false]);
      recordAttempt(false, null);
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(() => setFeedback(null), 400);
      return;
    }

    // Read the live held-key set from the store (updated synchronously before this fires)
    const held = useStore.getState().pressedKeys;
    const allHeld = required.every(m => held.includes(m));

    if (allHeld) {
      // All required notes are physically held right now → correct!
      isAdvancing.current = true;
      setFeedback('correct');
      setSession(p => ({ at: p.at + 1, co: p.co + 1 }));
      setHistory(h => [...h.slice(-99), true]);
      recordAttempt(true, null);
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      // Short flash (80 ms) then advance — keeps up with fast play
      feedbackTimeout.current = setTimeout(() => {
        isAdvancing.current = false;
        setCurrentColIdx(prev => prev + 1);
        setFeedback(null);
      }, 80);
    }
    // else: correct note but chord incomplete — wait silently for the rest
  }, [recordAttempt]);

  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  useEffect(() => {
    if (!isPlaying) {
      setFeedback(null);
      isAdvancing.current = false;
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    }
  }, [isPlaying]);

  const progress    = totalCols > 0 ? (currentColIdx / totalCols) * 100 : 0;
  const { at, co }  = session;
  const acc         = at > 0 ? Math.round((co / at) * 100) : 0;
  const currentCol = parsedMusic?.columns[currentColIdx];

  // Label for the current step
  const stepLabel = () => {
    if (!currentCol) return '';
    if (feedback) return currentCol.allMidi.map(midiToDisplayName).join(' + ');
    if (currentCol.allMidi.length > 1) {
      return currentCol.trebleIdx != null && currentCol.bassIdx != null
        ? 'Both hands'
        : 'Play chord';
    }
    return '?';
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!parsedMusic) {
    return (
      <div className="staff-area">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 520 }}>
          <div
            className={`upload-dropzone${dragover ? ' dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={e => { e.preventDefault(); setDragover(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <input ref={fileInputRef} type="file" accept={SUPPORTED_GUIDED} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
            {loading ? (
              <div style={{ color: 'var(--accent-gold)', fontFamily: 'Cormorant Garamond,serif', fontSize: 24 }}>Parsing…</div>
            ) : (
              <>
                <div className="upload-icon">🎼</div>
                <div className="upload-title">Upload Sheet Music</div>
                <div className="upload-subtitle">
                  Drop a file here or click to browse.<br />
                  Play each beat — both hands simultaneously when shown.
                </div>
                <div className="upload-formats">
                  {['MusicXML (.xml)', 'MIDI (.mid)'].map(f => <span key={f} className="format-tag">{f}</span>)}
                </div>
              </>
            )}
          </div>
          {parseError && <div style={{ color: 'var(--incorrect-red)', fontSize: 13 }}>{parseError}</div>}
        </div>
      </div>
    );
  }

  // ── Practice screen ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div className="staff-area">
        <div className={`feedback-overlay${feedback ? ` ${feedback}` : ''}`}>
          {feedback === 'correct'   && <div className="feedback-icon" style={{ color: 'var(--correct-green)' }}>✓</div>}
          {feedback === 'incorrect' && <div className="feedback-icon" style={{ color: 'var(--incorrect-red)' }}>✗</div>}
        </div>

        {!isPlaying ? (
          <div className="start-prompt">
            <div className="icon">♩</div>
            <p>
              <strong style={{ color: 'var(--accent-gold)' }}>{parsedMusic.title}</strong><br />
              {totalCols} steps · {parsedMusic.timeSignature} · {parsedMusic.tempo} BPM
              <span style={{ color: 'var(--text-dim)' }}> · Both hands</span><br /><br />
              Play both hands at each beat to advance.
            </p>
            <button className="start-btn" onClick={onStart}>Start</button>
            <button className="reset-btn" style={{ marginTop: 8 }} onClick={() => setParsedMusic(null)}>
              Upload different file
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            <StaffDisplay
              trebleMeasureNotes={trebleAnnotated}
              bassMeasureNotes={bassAnnotated}
              grandStaff={true}
              clef="treble"
              mode="sheet"
              timeSignature={parsedMusic.timeSignature}
            />

            {currentColIdx < totalCols && (
              <div className={`note-name-display${feedback ? ` ${feedback}` : ''}`}>
                {stepLabel()}
              </div>
            )}

            {currentColIdx >= totalCols && (
              <div className="measure-result pass" style={{ marginTop: 8 }}>🎉 Piece Complete!</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexShrink: 0 }}>
              <button className="skip-btn" onClick={skipToNext}>Skip →</button>
              <button className="stop-btn" onClick={onStop}>Stop</button>
              <button className="reset-btn" onClick={() => { isAdvancing.current = false; if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current); setCurrentColIdx(0); setFeedback(null); }}>Restart</button>
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ padding: '8px 28px', background: 'var(--bg-panel)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div className="sheet-progress-bar">
          <div className="sheet-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="sheet-progress-label">
          Step {Math.min(currentColIdx + 1, totalCols)} of {totalCols} — {acc}% accuracy
        </div>
      </div>

      {history.length > 0 && (
        <div className="history-panel">
          <div className="history-dots">
            {history.map((c, i) => <div key={i} className={`history-dot ${c ? 'correct' : 'incorrect'}`} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF Sheet View ───────────────────────────────────────────────────────────

function PdfView() {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);

  function loadFile(file) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPdfUrl(url);
  }

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  if (!pdfUrl) {
    return (
      <div className="staff-area">
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div
            className={`upload-dropzone${dragover ? ' dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={e => { e.preventDefault(); setDragover(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
          >
            <input ref={fileInputRef} type="file" accept={SUPPORTED_PDF} onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }} />
            <div className="upload-icon">📄</div>
            <div className="upload-title">Upload PDF Score</div>
            <div className="upload-subtitle">
              Drop your sheet music PDF here. It will be displayed so you<br />
              can read along while practicing on your keyboard or MIDI device.
            </div>
            <div className="upload-formats"><span className="format-tag">PDF</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        <button className="reset-btn" onClick={() => setPdfUrl(null)}>Upload different file</button>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 8 }}>
          Use any practice mode (Flash / Interval / Measure) in the sidebar while reading along
        </span>
      </div>
      <embed src={pdfUrl} type="application/pdf" className="pdf-embed" />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SheetMusicMode({ isPlaying, onStart, onStop, registerModeHandler }) {
  const [tab, setTab] = useState('guided');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div className="top-bar">
        <div className="mode-title">Sheet Music</div>
        <div className="sheet-tabs">
          {[{ id: 'guided', label: '♩ Guided Practice' }, { id: 'pdf', label: '📄 Sheet View (PDF)' }].map(t => (
            <button key={t.id} className={`sheet-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {tab === 'guided'
          ? <GuidedPractice isPlaying={isPlaying} onStart={onStart} onStop={onStop} registerModeHandler={registerModeHandler} />
          : <PdfView />}
      </div>
    </div>
  );
}
