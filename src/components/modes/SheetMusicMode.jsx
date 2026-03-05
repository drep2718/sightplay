import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import BeatIndicator from '../BeatIndicator.jsx';
import PieceLibrary from '../PieceLibrary.jsx';
import { parseMusicXML, parseMidiFile, parseMxlFile } from '../../utils/musicXmlParser.js';
import { midiToDisplayName } from '../../utils/noteUtils.js';
import { useStore } from '../../store/index.js';
import { useMetronome } from '../../hooks/useMetronome.js';
import { useAudioSynth } from '../../hooks/useAudioSynth.js';
import { api } from '../../hooks/useApi.js';

const SUPPORTED_GUIDED = '.xml,.musicxml,.mxl,.mid,.midi';
const SUPPORTED_PDF    = '.pdf';

/** Timing window to classify a played note as on-beat (ms) */
const TIMING_PERFECT_MS = 45;
const TIMING_GOOD_MS    = 110;

function getTimingLabel(errorMs) {
  const abs = Math.abs(errorMs);
  if (abs < TIMING_PERFECT_MS) return { label: 'On Beat',  cls: 'timing-perfect' };
  if (abs < TIMING_GOOD_MS)    return { label: 'Good',     cls: 'timing-good' };
  if (errorMs < 0)             return { label: 'Early',    cls: 'timing-off' };
  return                              { label: 'Late',     cls: 'timing-off' };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrnamentDescription(ornament, midis) {
  const root  = midis.length ? midiToDisplayName(midis[0])     : '?';
  const above = midis.length ? midiToDisplayName(midis[0] + 2) : '?';
  const below = midis.length ? midiToDisplayName(midis[0] - 2) : '?';
  switch (ornament) {
    case 'trill':            return `Rapidly alternate between ${root} and ${above} for the full duration. Start on the written note.`;
    case 'turn':             return `Play ${above}, ${root}, ${below}, ${root} in quick succession.`;
    case 'mordent':          return `Quickly play ${root}, ${below}, ${root}.`;
    case 'inverted-mordent': return `Quickly play ${root}, ${above}, ${root}.`;
    case 'tremolo':          return `Rapidly repeat ${root} for its full duration.`;
    default:                 return null;
  }
}

// ─── Score Overview ───────────────────────────────────────────────────────────

function ScoreOverview({ parsedMusic, startMeasure, endMeasure, onSelectMeasure }) {
  const isGrand = parsedMusic.hasBothStaves;
  const cols = isGrand ? 2 : 3;

  return (
    <div className="score-overview" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {parsedMusic.measures.map((measure, mIdx) => {
        const isSelected = mIdx >= startMeasure && mIdx <= endMeasure;

        const trebleNotes = measure.columns.map((col) => {
          if (col.trebleIdx !== null) {
            const event = measure.treble[col.trebleIdx];
            return { midi: event.midi, duration: event.duration, played: null, current: false, ornament: event.ornament ?? null };
          }
          const dur = col.bassIdx !== null ? measure.bass[col.bassIdx].duration : 'q';
          return { midi: [], duration: dur, isRest: true, played: null, current: false, ornament: null };
        });

        const bassNotes = measure.columns.map((col) => {
          if (col.bassIdx !== null) {
            const event = measure.bass[col.bassIdx];
            return { midi: event.midi, duration: event.duration, played: null, current: false, ornament: event.ornament ?? null };
          }
          const dur = col.trebleIdx !== null ? measure.treble[col.trebleIdx].duration : 'q';
          return { midi: [], duration: dur, isRest: true, played: null, current: false, ornament: null };
        });

        return (
          <div
            key={mIdx}
            className={`score-overview-measure${isSelected ? ' selected' : ''}`}
            onClick={() => onSelectMeasure(mIdx)}
          >
            <div className="score-overview-num">M{mIdx + 1}</div>
            <div className={`score-overview-staff${isGrand ? ' grand' : ''}`}>
              <StaffDisplay
                trebleMeasureNotes={isGrand ? trebleNotes : null}
                bassMeasureNotes={isGrand ? bassNotes : null}
                measureNotes={!isGrand ? trebleNotes : null}
                clef="treble"
                grandStaff={isGrand}
                mode="sheet"
                timeSignature={parsedMusic.timeSignature}
                showNoteNames={false}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Guided Practice ─────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1.0];

function GuidedPractice({ isPlaying, onStart, onStop, registerModeHandler }) {
  const { recordAttempt, recordNoteMiss, setBpm, setTimeSig, bpm, metroVolume, metronomeEnabled, noteSoundEnabled, showNoteNames, skipCountInOnRestart, autoLoopRange, pieces, loadPieces, setHighlightedMidi } = useStore(s => ({
    recordAttempt:        s.recordAttempt,
    recordNoteMiss:       s.recordNoteMiss,
    setBpm:               s.setBpm,
    setTimeSig:           s.setTimeSig,
    bpm:                  s.bpm,
    metroVolume:          s.metroVolume,
    metronomeEnabled:     s.metronomeEnabled,
    noteSoundEnabled:     s.noteSoundEnabled,
    showNoteNames:        s.showNoteNames,
    skipCountInOnRestart: s.skipCountInOnRestart,
    autoLoopRange:        s.autoLoopRange,
    pieces:               s.pieces,
    loadPieces:           s.loadPieces,
    setHighlightedMidi:   s.setHighlightedMidi,
  }));
  const { playNote } = useAudioSynth();

  const [parsedMusic,    setParsedMusic]    = useState(null);
  const [currentColIdx,  setCurrentColIdx]  = useState(0);
  const [feedback,       setFeedback]       = useState(null);   // 'correct' | 'incorrect' | 'missed'
  const [timingInfo,     setTimingInfo]     = useState(null);
  const [history,        setHistory]        = useState([]);
  const [session,        setSession]        = useState({ at: 0, co: 0 });
  const [dragover,       setDragover]       = useState(false);
  const [parseError,     setParseError]     = useState(null);
  const [loading,        setLoading]        = useState(false);
  // 'idle' | 'countIn' | 'playing' | 'done'
  const [phase,          setPhase]          = useState('idle');
  const [subdivision,    setSubdivision]    = useState(1);
  // 'both' | 'rh' | 'lh'
  const [handMode,       setHandMode]       = useState('both');
  const [practiceSpeed,  setPracticeSpeed]  = useState(1.0);
  const [saveToast,      setSaveToast]      = useState(null);
  const [saving,         setSaving]         = useState(false);
  const [alreadySavedId,       setAlreadySavedId]       = useState(null);
  const [peekActive,           setPeekActive]           = useState(false);
  const [hintsUsed,            setHintsUsed]            = useState(0);
  const [notePopup,            setNotePopup]            = useState(null);
  const [practiceStartMeasure, setPracticeStartMeasure] = useState(0);
  const [practiceEndMeasure,   setPracticeEndMeasure]   = useState(0);
  const [startInputText,       setStartInputText]       = useState('1');
  const [endInputText,         setEndInputText]         = useState('1');
  const startInputEditing = useRef(false);
  const endInputEditing   = useRef(false);
  const [showOverview,         setShowOverview]         = useState(false);
  const [startStep,            setStartStep]            = useState(1);
  const [previewPlaying,       setPreviewPlaying]       = useState(false);
  const [measurePreviewPlaying, setMeasurePreviewPlaying] = useState(false);
  // raw file for re-saving
  const rawFileRef = useRef({ type: null, content: null, name: null });

  const sessionRef          = useRef({ at: 0, co: 0 });
  const previewTimersRef    = useRef([]);
  const fileInputRef        = useRef(null);
  const feedbackTimeout     = useRef(null);
  const timingTimeout       = useRef(null);
  const isAdvancing             = useRef(false);
  const autoSkipTimeout         = useRef(null);
  const measurePreviewTimers    = useRef([]);
  const practiceStartRef  = useRef(0);  // performance.now() when playing began
  const S                 = useRef({});
  S.current = { parsedMusic, currentColIdx, isPlaying, phase, handMode, peekActive, noteSoundEnabled };

  // Sync measure input text when values change from arrow buttons
  useEffect(() => {
    if (!startInputEditing.current) setStartInputText(String(practiceStartMeasure + 1));
  }, [practiceStartMeasure]);
  useEffect(() => {
    if (!endInputEditing.current) setEndInputText(String(practiceEndMeasure + 1));
  }, [practiceEndMeasure]);

  // Load library on mount
  useEffect(() => { loadPieces(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-piece derived data ────────────────────────────────────────────────
  const beatsPerMeasure = useMemo(() => {
    if (!parsedMusic) return 4;
    return parseInt(parsedMusic.timeSignature.split('/')[0]) || 4;
  }, [parsedMusic]);

  const totalCols = parsedMusic?.columns.length ?? 0;

  // ── Practice range derived columns ────────────────────────────────────────
  const practiceStartCol = parsedMusic?.measureColStarts[practiceStartMeasure] ?? 0;
  const practiceEndCol   = parsedMusic
    ? (practiceEndMeasure < parsedMusic.measures.length - 1
        ? parsedMusic.measureColStarts[practiceEndMeasure + 1]
        : totalCols)
    : 0;

  // Effective BPM respects practiceSpeed
  const effectiveBpm = parsedMusic
    ? Math.max(20, Math.round(parsedMusic.tempo * practiceSpeed))
    : Math.max(20, Math.round(bpm * practiceSpeed));

  // ── Metronome ─────────────────────────────────────────────────────────────
  const metro = useMetronome({
    bpm:            effectiveBpm,
    beatsPerMeasure,
    subdivision,
    volume:         metronomeEnabled ? metroVolume : 0,
  });

  const playNoteRef      = useRef(playNote);
  const recordNoteMissRef = useRef(recordNoteMiss);
  playNoteRef.current      = playNote;
  recordNoteMissRef.current = recordNoteMiss;

  // ── Measure containing the current column ─────────────────────────────────
  const currentMeasureIdx = useMemo(() => {
    if (!parsedMusic?.measureColStarts?.length) return 0;
    const starts = parsedMusic.measureColStarts;
    for (let i = starts.length - 1; i >= 0; i--) {
      if (starts[i] <= currentColIdx) return i;
    }
    return 0;
  }, [parsedMusic, currentColIdx]);

  const currentMeasure  = parsedMusic?.measures[currentMeasureIdx] ?? { treble: [], bass: [], columns: [] };
  const measureColStart = parsedMusic?.measureColStarts[currentMeasureIdx] ?? 0;

  // ── Annotated notes for both staves (colors driven by column index) ─────────
  // Build column-aligned arrays so VexFlow can space treble and bass notes
  // against each other. For each column, whichever stave has no note gets a
  // ghost rest (isRest: true) whose duration matches the other stave's note.
  // This gives both voices the same tick sequence and aligns them correctly.
  const trebleAnnotated = useMemo(() => currentMeasure.columns.map((col, localColIdx) => {
    const colAbs = measureColStart + localColIdx;
    if (col.trebleIdx !== null) {
      const event = currentMeasure.treble[col.trebleIdx];
      return {
        midi:     event.midi,
        duration: event.duration,
        played:   colAbs < currentColIdx ? true : null,
        current:  colAbs === currentColIdx,
        ornament: event.ornament ?? null,
      };
    }
    const dur = col.bassIdx !== null ? currentMeasure.bass[col.bassIdx].duration : 'q';
    return { midi: [], duration: dur, isRest: true, played: null, current: false, ornament: null };
  }), [currentMeasure, measureColStart, currentColIdx]);

  const bassAnnotated = useMemo(() => currentMeasure.columns.map((col, localColIdx) => {
    const colAbs = measureColStart + localColIdx;
    if (col.bassIdx !== null) {
      const event = currentMeasure.bass[col.bassIdx];
      return {
        midi:     event.midi,
        duration: event.duration,
        played:   colAbs < currentColIdx ? true : null,
        current:  colAbs === currentColIdx,
        ornament: event.ornament ?? null,
      };
    }
    const dur = col.trebleIdx !== null ? currentMeasure.treble[col.trebleIdx].duration : 'q';
    return { midi: [], duration: dur, isRest: true, played: null, current: false, ornament: null };
  }), [currentMeasure, measureColStart, currentColIdx]);

  // ── File loading ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    setParseError(null);
    setLoading(true);
    setParsedMusic(null);
    setCurrentColIdx(0);
    setFeedback(null);
    setHistory([]);
    setPhase('idle');
    setPracticeSpeed(1.0);
    setHandMode('both');
    setAlreadySavedId(null);
    setPracticeStartMeasure(0);
    setPracticeEndMeasure(0);
    setShowOverview(false);
    setStartStep(1);
    const fresh = { at: 0, co: 0 };
    sessionRef.current = fresh;
    setSession(fresh);
    isAdvancing.current = false;
    rawFileRef.current = { type: null, content: null, name: null };

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let result;
      if (ext === 'xml' || ext === 'musicxml') {
        const text = await file.text();
        result = parseMusicXML(text);
        rawFileRef.current = { type: 'xml', content: text, name: file.name.replace(/\.[^.]+$/, '') };
      } else if (ext === 'mxl') {
        const buffer = await file.arrayBuffer();
        result = await parseMxlFile(buffer);
        // Store as base64
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        rawFileRef.current = { type: 'mxl', content: btoa(binary), name: file.name.replace(/\.[^.]+$/, '') };
      } else if (ext === 'mid' || ext === 'midi') {
        const buffer = await file.arrayBuffer();
        result = await parseMidiFile(buffer);
        // Store as base64
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        rawFileRef.current = { type: 'midi', content: btoa(binary), name: file.name.replace(/\.[^.]+$/, '') };
      } else {
        setParseError('Unsupported type. Please use .xml, .musicxml, .mxl, .mid, or .midi');
        setLoading(false);
        return;
      }

      if (!result || result.columns.length === 0) {
        setParseError('No playable notes found in the file.');
      } else {
        setParsedMusic(result);
        setPracticeStartMeasure(0);
        setPracticeEndMeasure(result.measures.length - 1);
        // Auto-apply the piece's tempo and time signature
        setBpm(result.tempo);
        setTimeSig(result.timeSignature);
      }
    } catch (err) {
      console.error(err);
      setParseError('Failed to parse file.');
    }
    setLoading(false);
  }

  // ── Load from library ─────────────────────────────────────────────────────
  async function handleLoadFromLibrary(piece) {
    setParseError(null);
    setLoading(true);
    setParsedMusic(null);
    setCurrentColIdx(0);
    setFeedback(null);
    setHistory([]);
    setPhase('idle');
    setPracticeSpeed(1.0);
    setHandMode('both');
    setStartStep(1);
    const fresh = { at: 0, co: 0 };
    sessionRef.current = fresh;
    setSession(fresh);
    isAdvancing.current = false;
    rawFileRef.current = { type: piece.file_type, content: piece.file_content, name: piece.title };
    setAlreadySavedId(piece.id);

    try {
      let result;
      if (piece.file_type === 'xml') {
        result = parseMusicXML(piece.file_content);
      } else if (piece.file_type === 'mxl') {
        const binary = atob(piece.file_content);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        result = await parseMxlFile(bytes.buffer);
      } else {
        const binary = atob(piece.file_content);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        result = await parseMidiFile(bytes.buffer);
      }

      if (!result || result.columns.length === 0) {
        setParseError('No playable notes found in this piece.');
      } else {
        setParsedMusic(result);
        setPracticeStartMeasure(0);
        setPracticeEndMeasure(result.measures.length - 1);
        setBpm(result.tempo);
        setTimeSig(result.timeSignature);
      }
    } catch (err) {
      console.error(err);
      setParseError('Failed to parse piece.');
    }
    setLoading(false);
  }

  // ── Save to library ───────────────────────────────────────────────────────
  async function handleSave() {
    const raw = rawFileRef.current;
    if (!raw.content || !parsedMusic) return;
    setSaving(true);
    setSaveToast(null);
    try {
      const title = parsedMusic.title !== 'Unknown' ? parsedMusic.title : raw.name || 'Untitled';
      const res = await api.post('/pieces', {
        title,
        file_type:      raw.type,
        file_content:   raw.content,
        tempo:          parsedMusic.tempo,
        time_sig:       parsedMusic.timeSignature,
        total_cols:     parsedMusic.columns.length,
        has_both_staves: parsedMusic.hasBothStaves,
      });
      setAlreadySavedId(res.data.piece?.id ?? true);
      setSaveToast({ msg: 'Saved to library!', ok: true });
      loadPieces();
    } catch (err) {
      const status = err?.response?.status;
      const msg = status === 413 ? 'File too large'
                : status === 422 ? 'Library full (50 piece limit)'
                : status === 400 ? 'Invalid file data'
                : err?.response?.data?.error || 'Failed to save';
      setSaveToast({ msg, ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveToast(null), 2500);
    }
  }

  // ── Note click handler (clickable staff) ─────────────────────────────────
  // Popup stays until the user clicks a different note — no timer, no auto-dismiss.
  const handleNoteClickInStaff = useCallback((colIdx, midis, ornament) => {
    setHighlightedMidi(midis);
    setNotePopup({ midis, ornament });
  }, [setHighlightedMidi]);

  // ── Peek: highlight next required note(s) until played ───────────────────
  const handlePeek = useCallback(() => {
    const s = S.current;
    if (peekActive) {
      // Toggle off
      setPeekActive(false);
      setHighlightedMidi([]);
      return;
    }
    if (!s.parsedMusic || s.phase !== 'playing') return;
    const col = s.parsedMusic.columns[s.currentColIdx];
    if (!col) return;
    setHighlightedMidi(col.allMidi);
    setPeekActive(true);
    setHintsUsed(h => h + 1);
  }, [peekActive, setHighlightedMidi]);

  // ── Skip to next column ───────────────────────────────────────────────────
  const skipToNext = useCallback(() => {
    clearTimeout(feedbackTimeout.current);
    isAdvancing.current = false;
    setCurrentColIdx(prev => Math.min(prev + 1, totalCols));
    setFeedback(null);
    setTimingInfo(null);
    setPeekActive(false);
    setHighlightedMidi([]);
  }, [totalCols, setHighlightedMidi]);

  // ── Jump to start of prev / next measure ─────────────────────────────────
  // ── Preview playback ──────────────────────────────────────────────────────
  const stopPreview = useCallback(() => {
    previewTimersRef.current.forEach(t => clearTimeout(t));
    previewTimersRef.current = [];
    setPreviewPlaying(false);
  }, []);

  const playPreview = useCallback(() => {
    if (!parsedMusic) return;
    if (previewPlaying) { stopPreview(); return; }

    const cols = parsedMusic.columns.slice(practiceStartCol, practiceEndCol);
    if (!cols.length) return;

    setPreviewPlaying(true);
    const beatMs = (60 / effectiveBpm) * 1000;
    const startBeat = cols[0].globalBeatPos;
    const timers = [];

    cols.forEach((col, i) => {
      if (!col.allMidi.length) return;
      const timeMs = (col.globalBeatPos - startBeat) * beatMs;
      const nextBeat = i + 1 < cols.length ? cols[i + 1].globalBeatPos : col.globalBeatPos + 1;
      const noteDurSec = Math.min((nextBeat - col.globalBeatPos) * beatMs / 1000 * 0.85, 1.2);
      timers.push(setTimeout(() => {
        col.allMidi.forEach(m => playNote(m, 0.5, Math.max(noteDurSec, 0.12)));
      }, timeMs));
    });

    const totalMs = (cols.at(-1).globalBeatPos - startBeat + 1) * beatMs;
    timers.push(setTimeout(() => {
      setPreviewPlaying(false);
      previewTimersRef.current = [];
    }, totalMs + 150));

    previewTimersRef.current = timers;
  }, [parsedMusic, practiceStartCol, practiceEndCol, effectiveBpm, previewPlaying, playNote, stopPreview]);

  // ── Current-measure preview (playable while practicing) ───────────────────
  const stopMeasurePreview = useCallback(() => {
    measurePreviewTimers.current.forEach(t => clearTimeout(t));
    measurePreviewTimers.current = [];
    setMeasurePreviewPlaying(false);
  }, []);

  const playCurrentMeasure = useCallback(() => {
    if (!parsedMusic) return;
    if (measurePreviewPlaying) { stopMeasurePreview(); return; }

    const mStart = parsedMusic.measureColStarts[currentMeasureIdx];
    const mEnd   = currentMeasureIdx + 1 < parsedMusic.measures.length
      ? parsedMusic.measureColStarts[currentMeasureIdx + 1]
      : totalCols;

    const cols = parsedMusic.columns.slice(mStart, mEnd).filter(c => c.allMidi.length);
    if (!cols.length) return;

    setMeasurePreviewPlaying(true);
    const beatMs   = (60 / effectiveBpm) * 1000;
    const startBeat = cols[0].globalBeatPos;
    const timers = [];

    cols.forEach((col, i) => {
      const timeMs     = (col.globalBeatPos - startBeat) * beatMs;
      const nextBeat   = i + 1 < cols.length ? cols[i + 1].globalBeatPos : col.globalBeatPos + 1;
      const noteDurSec = Math.min((nextBeat - col.globalBeatPos) * beatMs / 1000 * 0.85, 1.2);
      timers.push(setTimeout(() => {
        col.allMidi.forEach(m => playNote(m, 0.5, Math.max(noteDurSec, 0.12)));
      }, timeMs));
    });

    const totalMs = (cols.at(-1).globalBeatPos - startBeat + 1) * beatMs;
    timers.push(setTimeout(() => {
      setMeasurePreviewPlaying(false);
      measurePreviewTimers.current = [];
    }, totalMs + 150));

    measurePreviewTimers.current = timers;
  }, [parsedMusic, currentMeasureIdx, totalCols, effectiveBpm, measurePreviewPlaying, playNote, stopMeasurePreview]);

  // ── Jump to start of prev / next measure ─────────────────────────────────
  const jumpMeasure = useCallback((delta) => {
    if (!parsedMusic) return;
    clearTimeout(feedbackTimeout.current);
    clearTimeout(autoSkipTimeout.current);
    isAdvancing.current = false;
    setFeedback(null);
    setTimingInfo(null);
    setPeekActive(false);
    setHighlightedMidi([]);
    stopMeasurePreview();

    const starts        = parsedMusic.measureColStarts;
    const target        = Math.max(0, Math.min(parsedMusic.measures.length - 1, currentMeasureIdx + delta));
    const clampedTarget = Math.max(practiceStartMeasure, Math.min(practiceEndMeasure, target));
    setCurrentColIdx(starts[clampedTarget]);
  }, [parsedMusic, currentMeasureIdx, practiceStartMeasure, practiceEndMeasure, setHighlightedMidi, stopMeasurePreview]);

  // ── Start practice with count-in ──────────────────────────────────────────
  const startPractice = useCallback(({ isRestart = false } = {}) => {
    stopPreview();
    stopMeasurePreview();
    isAdvancing.current = false;
    setCurrentColIdx(practiceStartCol);
    setFeedback(null);
    setTimingInfo(null);
    setPeekActive(false);
    setHintsUsed(0);
    setHighlightedMidi([]);
    setNotePopup(null);
    const fresh = { at: 0, co: 0 };
    sessionRef.current = fresh;
    setSession(fresh);
    setHistory([]);

    if (isRestart && skipCountInOnRestart) {
      practiceStartRef.current = performance.now();
      setPhase('playing');
      metro.start({});
    } else {
      setPhase('countIn');
      metro.start({
        countIn: beatsPerMeasure,
        onCountInDone: () => {
          practiceStartRef.current = performance.now();
          setPhase('playing');
        },
      });
    }
  }, [metro, beatsPerMeasure, practiceStartCol, skipCountInOnRestart]);

  // ── Note-on handler — Active Set pattern ─────────────────────────────────
  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if ((s.phase !== 'playing') || !s.parsedMusic) return;
    if (s.currentColIdx >= s.parsedMusic.columns.length) return;
    if (isAdvancing.current) return;

    const col = s.parsedMusic.columns[s.currentColIdx];

    // Filter required notes based on hand mode
    let required = col.allMidi;
    if (s.handMode === 'rh') {
      required = col.trebleIdx != null
        ? (s.parsedMusic.measures[0]?.treble ?? [])  // will resolve below
        : [];
      // Resolve treble MIDI for this col across all measures
      const mIdx = s.parsedMusic.measureColStarts
        ? (() => {
            const starts = s.parsedMusic.measureColStarts;
            let mi = 0;
            for (let i = starts.length - 1; i >= 0; i--) {
              if (starts[i] <= s.currentColIdx) { mi = i; break; }
            }
            return mi;
          })()
        : 0;
      const measure = s.parsedMusic.measures[mIdx];
      required = col.trebleIdx != null && measure
        ? (measure.treble[col.trebleIdx]?.midi ?? [])
        : [];
    } else if (s.handMode === 'lh') {
      const mIdx = s.parsedMusic.measureColStarts
        ? (() => {
            const starts = s.parsedMusic.measureColStarts;
            let mi = 0;
            for (let i = starts.length - 1; i >= 0; i--) {
              if (starts[i] <= s.currentColIdx) { mi = i; break; }
            }
            return mi;
          })()
        : 0;
      const measure = s.parsedMusic.measures[mIdx];
      required = col.bassIdx != null && measure
        ? (measure.bass[col.bassIdx]?.midi ?? [])
        : [];
    }

    if (!required.length) {
      // No notes for active hand — skip col silently
      isAdvancing.current = true;
      clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(() => {
        isAdvancing.current = false;
        setCurrentColIdx(prev => prev + 1);
      }, 30);
      return;
    }

    // Timing accuracy — how far from the last beat?
    const rawError   = performance.now() - metro.lastBeatMsRef.current;
    const beatMs     = (60 / (s.parsedMusic.tempo || 80)) * 1000;
    const normError  = rawError > beatMs * 0.5 ? rawError - beatMs : rawError;
    const tInfo      = getTimingLabel(normError);

    if (!required.includes(midi)) {
      required.forEach(n => {
        if (s.noteSoundEnabled) playNoteRef.current(n, 0.2);
        recordNoteMissRef.current(n);
      });
      setFeedback('incorrect');
      setTimingInfo(null);
      setSession(p => { const n = { ...p, at: p.at + 1 }; sessionRef.current = n; return n; });
      setHistory(h => [...h.slice(-99), false]);
      recordAttempt(false, null);
      clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(() => setFeedback(null), 400);
      return;
    }

    // Check all required notes are held simultaneously
    const held    = useStore.getState().pressedKeys;
    const allHeld = required.every(m => held.includes(m));

    if (allHeld) {
      if (s.noteSoundEnabled) required.forEach(n => playNoteRef.current(n));
      isAdvancing.current = true;
      setFeedback('correct');
      setTimingInfo(tInfo);
      setSession(p => { const n = { at: p.at + 1, co: p.co + 1 }; sessionRef.current = n; return n; });
      setHistory(h => [...h.slice(-99), true]);
      recordAttempt(true, null);

      clearTimeout(feedbackTimeout.current);
      clearTimeout(timingTimeout.current);
      feedbackTimeout.current = setTimeout(() => {
        isAdvancing.current = false;
        setCurrentColIdx(prev => prev + 1);
        setFeedback(null);
        // Clear peek once the note is played — its job is done
        if (S.current.peekActive) {
          setPeekActive(false);
          setHighlightedMidi([]);
        }
      }, 80);
      timingTimeout.current = setTimeout(() => setTimingInfo(null), 1200);
    }
  }, [metro.lastBeatMsRef, recordAttempt]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  // Stop previews on unmount
  useEffect(() => () => { stopPreview(); stopMeasurePreview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isPlaying) {
      metro.stop();
      setFeedback(null);
      setTimingInfo(null);
      isAdvancing.current = false;
      clearTimeout(feedbackTimeout.current);
      clearTimeout(timingTimeout.current);
      setPeekActive(false);
      setHintsUsed(0);
      setHighlightedMidi([]);
      setNotePopup(null);
      setPhase('idle');
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Piece complete ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentColIdx >= practiceEndCol && practiceEndCol > 0 && phase === 'playing') {
      metro.stop();
      if (autoLoopRange) {
        startPractice({ isRestart: true });
      } else {
        setPhase('done');
      }
    }
  }, [currentColIdx, practiceEndCol, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-skip columns with no notes for the active hand ───────────────────
  useEffect(() => {
    if (phase !== 'playing' || handMode === 'both' || !parsedMusic) return;
    if (currentColIdx >= practiceEndCol) return;

    const col     = parsedMusic.columns[currentColIdx];
    const starts  = parsedMusic.measureColStarts;
    let mi = 0;
    for (let i = starts.length - 1; i >= 0; i--) {
      if (starts[i] <= currentColIdx) { mi = i; break; }
    }
    const measure  = parsedMusic.measures[mi];
    const required = handMode === 'rh'
      ? (col.trebleIdx != null && measure ? (measure.treble[col.trebleIdx]?.midi ?? []) : [])
      : (col.bassIdx   != null && measure ? (measure.bass[col.bassIdx]?.midi   ?? []) : []);

    if (required.length === 0) {
      clearTimeout(autoSkipTimeout.current);
      autoSkipTimeout.current = setTimeout(() => {
        setCurrentColIdx(prev => prev + 1);
      }, 20);
    }
  }, [currentColIdx, phase, handMode, parsedMusic, practiceEndCol]);

  // ── Derived UI ─────────────────────────────────────────────────────────────
  const practiceRange = practiceEndCol - practiceStartCol;
  const progress = practiceRange > 0
    ? Math.max(0, Math.min(100, ((currentColIdx - practiceStartCol) / practiceRange) * 100))
    : 0;
  const { at, co } = session;
  const acc        = at > 0 ? Math.round((co / at) * 100) : 0;

  const currentCol = parsedMusic?.columns[currentColIdx];

  /** Rich label for what the user needs to play right now */
  const stepLabel = () => {
    if (!currentCol) return '';
    const names = currentCol.allMidi.map(midiToDisplayName);
    if (feedback) return names.join(' + ');
    const hasTreble = currentCol.trebleIdx != null;
    const hasBass   = currentCol.bassIdx   != null;
    if (hasTreble && hasBass)  return `Both hands: ${names.join(' + ')}`;
    if (currentCol.allMidi.length > 1) return `Chord: ${names.join(' + ')}`;
    return '?';
  };

  // Per-hand note names for the current column
  const handNames = useMemo(() => {
    if (!currentCol || !parsedMusic) return null;
    const measure  = parsedMusic.measures[currentMeasureIdx];
    const hasTreble = currentCol.trebleIdx != null && measure;
    const hasBass   = currentCol.bassIdx   != null && measure;
    if (!hasTreble && !hasBass) return null;
    const rhNames = hasTreble
      ? measure.treble[currentCol.trebleIdx]?.midi.map(midiToDisplayName).join(', ')
      : null;
    const lhNames = hasBass
      ? measure.bass[currentCol.bassIdx]?.midi.map(midiToDisplayName).join(', ')
      : null;
    if (rhNames && lhNames) return { rh: rhNames, lh: lhNames };
    return null;
  }, [currentCol, parsedMusic, currentMeasureIdx]);

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!parsedMusic) {
    return (
      <div className="staff-area">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%', maxWidth: 520 }}>
          <PieceLibrary
            pieces={pieces}
            onLoad={handleLoadFromLibrary}
            onRefresh={loadPieces}
          />
          <div
            className={`upload-dropzone${dragover ? ' dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragover(true); }}
            onDragLeave={() => setDragover(false)}
            onDrop={e => { e.preventDefault(); setDragover(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_GUIDED}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
            />
            {loading ? (
              <div style={{ color: 'var(--accent-gold)', fontFamily: 'Cormorant Garamond,serif', fontSize: 24 }}>Parsing…</div>
            ) : (
              <>
                <div className="upload-icon">🎼</div>
                <div className="upload-title">Upload Sheet Music</div>
                <div className="upload-subtitle">
                  Drop a file here or click to browse.<br />
                  The app will read the full piece — every beat, both hands — and guide you through it with a metronome.
                </div>
                <div className="upload-formats">
                  {['MusicXML (.xml)', 'Compressed MusicXML (.mxl)', 'MIDI (.mid)'].map(f => <span key={f} className="format-tag">{f}</span>)}
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
          {feedback === 'missed'    && <div className="feedback-icon" style={{ color: 'var(--text-dim)' }}>→</div>}
        </div>

        {!isPlaying ? (
          // ── Start screen ─────────────────────────────────────────────────
          <div className="start-prompt" style={{ maxWidth: 480, width: '100%' }}>
            <div className="icon">♩</div>
            <p>
              <strong style={{ color: 'var(--accent-gold)' }}>{parsedMusic.title}</strong><br />
              {totalCols} beats · {parsedMusic.timeSignature} · {parsedMusic.tempo} BPM
              {parsedMusic.hasBothStaves && <span style={{ color: 'var(--blue)' }}> · Grand Staff</span>}
              <br /><br />
              A count-in measure will play before the piece starts.<br />
              Play both hands simultaneously on each beat.
            </p>

            {/* ── Hands separate ─────────────────────────── */}
            {parsedMusic.hasBothStaves && (
              <div className="hand-mode-row">
                {[
                  { id: 'both', label: 'Both Hands' },
                  { id: 'rh',   label: 'Right Hand' },
                  { id: 'lh',   label: 'Left Hand' },
                ].map(h => (
                  <button
                    key={h.id}
                    className={`hand-mode-btn${handMode === h.id ? ' active' : ''}`}
                    onClick={() => setHandMode(h.id)}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Practice speed ─────────────────────────── */}
            <div className="speed-row">
              <span className="setting-label">Speed</span>
              <div className="btn-group">
                {SPEED_OPTIONS.map(s => (
                  <button
                    key={s}
                    className={practiceSpeed === s ? 'active' : ''}
                    onClick={() => setPracticeSpeed(s)}
                  >
                    {s === 1 ? '100%' : `${s * 100}%`}
                  </button>
                ))}
              </div>
              <span className="setting-value" style={{ fontSize: 11 }}>
                {Math.max(20, Math.round(parsedMusic.tempo * practiceSpeed))} BPM
              </span>
            </div>

            {/* ── Score Overview toggle ────────────────── */}
            <button
              className="piece-library-toggle"
              onClick={() => setShowOverview(v => !v)}
              style={{ width: 'auto', padding: '5px 14px' }}
            >
              Score Overview {showOverview ? '▲' : '▼'}
            </button>
            {showOverview && (
              <div className="score-overview-container">
                <ScoreOverview
                  parsedMusic={parsedMusic}
                  startMeasure={practiceStartMeasure}
                  endMeasure={practiceEndMeasure}
                  onSelectMeasure={(mIdx) => {
                    if (mIdx < practiceStartMeasure) {
                      setPracticeStartMeasure(mIdx);
                    } else if (mIdx > practiceEndMeasure) {
                      setPracticeEndMeasure(mIdx);
                    } else if (mIdx === practiceStartMeasure && mIdx === practiceEndMeasure) {
                      // already single — do nothing
                    } else {
                      // inside range — collapse to single measure
                      setPracticeStartMeasure(mIdx);
                      setPracticeEndMeasure(mIdx);
                    }
                  }}
                />
              </div>
            )}

            {/* ── Practice range controls ──────────────── */}
            <div className="range-row">
              <span className="setting-label">Practice</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>M</span>
              <button className="range-btn" onClick={() => setPracticeStartMeasure(m => Math.max(0, m - 1))} title="Earlier start">‹</button>
              {(() => {
                const startV = parseInt(startInputText, 10);
                const startInvalid = isNaN(startV) || startV < 1 || startV > practiceEndMeasure + 1;
                return (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={startInputText}
                    onFocus={() => { startInputEditing.current = true; }}
                    onBlur={() => {
                      startInputEditing.current = false;
                      if (!isNaN(startV) && startV >= 1 && startV <= practiceEndMeasure + 1) {
                        setPracticeStartMeasure(startV - 1);
                      }
                      setStartInputText(String(practiceStartMeasure + 1));
                    }}
                    onChange={e => setStartInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: 'var(--accent-gold)', width: 36, textAlign: 'center', background: 'transparent', border: `1px solid ${startInvalid && startInputText !== '' ? 'var(--error, #e05)' : 'var(--border)'}`, borderRadius: 4, padding: '1px 2px' }}
                  />
                );
              })()}
              <button className="range-btn" onClick={() => setPracticeStartMeasure(m => Math.min(practiceEndMeasure, m + 1))} title="Later start">›</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 4px' }}>to M</span>
              <button className="range-btn" onClick={() => setPracticeEndMeasure(m => Math.max(practiceStartMeasure, m - 1))} title="Earlier end">‹</button>
              {(() => {
                const endV = parseInt(endInputText, 10);
                const maxM = parsedMusic?.measures.length ?? 1;
                const endInvalid = isNaN(endV) || endV < practiceStartMeasure + 1 || endV > maxM;
                return (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={endInputText}
                    onFocus={() => { endInputEditing.current = true; }}
                    onBlur={() => {
                      endInputEditing.current = false;
                      if (!isNaN(endV) && endV >= practiceStartMeasure + 1 && endV <= maxM) {
                        setPracticeEndMeasure(endV - 1);
                      }
                      setEndInputText(String(practiceEndMeasure + 1));
                    }}
                    onChange={e => setEndInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, color: 'var(--accent-gold)', width: 36, textAlign: 'center', background: 'transparent', border: `1px solid ${endInvalid && endInputText !== '' ? 'var(--error, #e05)' : 'var(--border)'}`, borderRadius: 4, padding: '1px 2px' }}
                  />
                );
              })()}
              <button className="range-btn" onClick={() => setPracticeEndMeasure(m => Math.min((parsedMusic?.measures.length ?? 1) - 1, m + 1))} title="Later end">›</button>
              <button
                className="reset-btn"
                style={{ padding: '2px 8px', fontSize: 11, marginTop: 0 }}
                onClick={() => { setPracticeStartMeasure(0); setPracticeEndMeasure((parsedMusic?.measures.length ?? 1) - 1); }}
              >All</button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="start-btn" onClick={() => { onStart(); startPractice(); }}>Start</button>
              <button
                className={`peek-btn${previewPlaying ? ' active' : ''}`}
                style={{ fontSize: 13 }}
                onClick={playPreview}
                title={previewPlaying ? 'Stop preview' : 'Hear the selected measures'}
              >
                {previewPlaying ? '■ Stop' : '▶ Preview'}
              </button>
              <button className="reset-btn" style={{ marginTop: 0 }} onClick={() => setParsedMusic(null)}>
                Upload different file
              </button>
              {rawFileRef.current?.content && (
                <button
                  className="save-piece-btn"
                  onClick={handleSave}
                  disabled={saving || !!alreadySavedId}
                >
                  {saving ? 'Saving…' : alreadySavedId ? 'Saved ✓' : '+ Save to Library'}
                </button>
              )}
            </div>
            {saveToast && (
              <div className={`piece-toast${saveToast.ok ? '' : ' error'}`}>{saveToast.msg}</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            {/* ── Count-in overlay ─────────────────────────────────────── */}
            {phase === 'countIn' && (
              <div className="count-in-overlay">
                <div className="count-in-num">{(metro.countInBeat ?? 0) + 1}</div>
                <div className="count-in-text">{parsedMusic.title}</div>
              </div>
            )}

            {/* ── Staff ────────────────────────────────────────────────── */}
            {(phase === 'playing' || phase === 'done') && (
              <>
                <StaffDisplay
                  trebleMeasureNotes={trebleAnnotated}
                  bassMeasureNotes={bassAnnotated}
                  grandStaff={true}
                  clef="treble"
                  mode="sheet"
                  timeSignature={parsedMusic.timeSignature}
                  showNoteNames={showNoteNames}
                  dimTreble={handMode === 'lh'}
                  dimBass={handMode === 'rh'}
                  onNoteClick={handleNoteClickInStaff}
                />
                {notePopup && (
                  <div className="note-popup">
                    <span className="note-popup-name">{notePopup.midis.map(m => midiToDisplayName(m)).join(' + ')}</span>
                    {notePopup.ornament && (
                      <span className="note-popup-ornament">
                        — {getOrnamentDescription(notePopup.ornament, notePopup.midis)}
                      </span>
                    )}
                    <button className="note-popup-close" onClick={() => { setNotePopup(null); setHighlightedMidi([]); }}>×</button>
                  </div>
                )}
              </>
            )}

            {/* ── Current step info ────────────────────────────────────── */}
            {phase === 'playing' && currentColIdx < totalCols && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                {/* RH + LH labels — only shown when peek is active */}
                {peekActive && handNames && (
                  <div className="hand-names-row">
                    <span className="hand-label rh">RH: {handNames.rh}</span>
                    <span className="hand-label lh">LH: {handNames.lh}</span>
                  </div>
                )}
                {/* Timing feedback — always shown */}
                {timingInfo && (
                  <div className={`timing-label ${timingInfo.cls}`}>{timingInfo.label}</div>
                )}
              </div>
            )}

            {phase === 'done' && (
              <div className="measure-result pass" style={{ marginTop: 8 }}>
                🎉 Piece Complete! {acc}% accuracy
              </div>
            )}

            {/* ── Metronome + beat indicator (during play) ─────────────── */}
            {(phase === 'playing' || phase === 'countIn') && (
              <div className="sheet-metro-bar">
                {metronomeEnabled && (
                  <BeatIndicator
                    currentBeat={metro.currentBeat}
                    countInBeat={metro.countInBeat}
                    countingIn={metro.countingIn}
                    beatsPerMeasure={beatsPerMeasure}
                    subdivision={subdivision}
                    currentSubBeat={metro.currentSubBeat}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div className="bpm-display">{effectiveBpm}</div>
                  <div className="bpm-label">{practiceSpeed < 1 ? `${practiceSpeed * 100}%` : 'BPM'}</div>
                </div>
                <div style={{ width: 1, height: 32, background: 'var(--border)' }} />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div className="bpm-display" style={{ fontSize: 15 }}>
                    {currentMeasureIdx - practiceStartMeasure + 1}
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'DM Sans,sans-serif' }}>
                      /{practiceEndMeasure - practiceStartMeasure + 1}
                    </span>
                  </div>
                  <div className="bpm-label">Measure</div>
                </div>
                {/* Subdivision selector */}
                <div className="subdivision-selector">
                  <div className="bpm-label" style={{ marginBottom: 4 }}>Sub</div>
                  <div className="btn-group">
                    {[1, 2, 4].map(s => (
                      <button
                        key={s}
                        className={subdivision === s ? 'active' : ''}
                        onClick={() => setSubdivision(s)}
                        title={s === 1 ? 'Quarter' : s === 2 ? 'Eighth' : 'Sixteenth'}
                      >
                        {s === 1 ? '♩' : s === 2 ? '♪' : '𝅘𝅥𝅯'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexShrink: 0 }}>
              <button className="range-btn" onClick={() => jumpMeasure(-1)} title="Previous measure" style={{ fontSize: 16, padding: '2px 8px' }}>‹</button>
              <button className="range-btn" onClick={() => jumpMeasure(1)}  title="Next measure"     style={{ fontSize: 16, padding: '2px 8px' }}>›</button>
              <button className="skip-btn" onClick={skipToNext}>Skip →</button>
              <button className="stop-btn" onClick={() => onStop({ total_attempts: sessionRef.current.at, total_correct: sessionRef.current.co })}>
                Stop
              </button>
              <button className="reset-btn" onClick={() => startPractice({ isRestart: true })}>Restart</button>
              <button className="reset-btn" onClick={() => { metro.stop(); isAdvancing.current = false; clearTimeout(feedbackTimeout.current); clearTimeout(timingTimeout.current); setCurrentColIdx(0); setFeedback(null); setPhase('idle'); setParsedMusic(null); onStop({ total_attempts: sessionRef.current.at, total_correct: sessionRef.current.co }); }}>
                New File
              </button>
              <button
                className={`peek-btn${peekActive ? ' active' : ''}`}
                onClick={handlePeek}
                title={peekActive ? 'Cancel peek' : `Show next note on keyboard (${hintsUsed} used)`}
              >
                {peekActive ? '★ Peek' : '☆ Peek'}
              </button>
              <button
                className={`peek-btn${measurePreviewPlaying ? ' active' : ''}`}
                onClick={playCurrentMeasure}
                title={measurePreviewPlaying ? 'Stop preview' : 'Hear current measure'}
              >
                {measurePreviewPlaying ? '◼ Listen' : '♬ Listen'}
              </button>
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
          Beat {Math.min(currentColIdx - practiceStartCol + 1, practiceRange)} of {practiceRange} — Measure {currentMeasureIdx + 1}
          {practiceStartMeasure > 0 || practiceEndMeasure < (parsedMusic?.measures.length ?? 1) - 1
            ? ` (M${practiceStartMeasure + 1}–M${practiceEndMeasure + 1})`
            : ''} — {acc}% accuracy
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
