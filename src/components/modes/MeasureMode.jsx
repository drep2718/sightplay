import React, { useState, useRef, useCallback, useEffect } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import BeatIndicator from '../BeatIndicator.jsx';
import { useStore } from '../../store/index.js';
import { generateMeasure, getEffectiveRange, TIERS } from '../../utils/generators.js';
import { useMetronome } from '../../hooks/useMetronome.js';
import { useAudioSynth } from '../../hooks/useAudioSynth.js';

const SUBDIVISION_LABELS = { 1: '♩', 2: '♪', 4: '𝅘𝅥𝅯' };

function freshSession() { return { at: 0, co: 0 }; }

/** Label the timing of a note relative to the last beat */
function getTimingLabel(timingErrorMs) {
  const abs = Math.abs(timingErrorMs);
  if (abs < 40)   return { label: 'Perfect', cls: 'timing-perfect' };
  if (abs < 100)  return { label: 'Good',    cls: 'timing-good' };
  if (timingErrorMs < -100) return { label: 'Early', cls: 'timing-off' };
  return { label: 'Late', cls: 'timing-off' };
}

export default function MeasureMode({ isPlaying, onStart, onStop, registerModeHandler }) {
  const { clef, tier, accidentals, bpm, timeSig, metroVolume, showNoteNames, recordNoteMiss } = useStore();
  const { playNote } = useAudioSynth();

  const [currentMeasure, setCurrentMeasure] = useState(null);
  const [measureIndex,   setMeasureIndex]   = useState(0);
  const [activeClef,     setActiveClef]     = useState('treble');
  const [measureResult,  setMeasureResult]  = useState(null);
  const [session,        setSession]        = useState(freshSession);
  const [history,        setHistory]        = useState([]);
  // 'idle' | 'countIn' | 'playing'
  const [phase,          setPhase]          = useState('idle');
  const [timingInfo,     setTimingInfo]     = useState(null);
  const [subdivision,    setSubdivision]    = useState(1);

  const sessionRef    = useRef(freshSession());
  const resultTimeout = useRef(null);
  const timingTimeout = useRef(null);

  const beats = parseInt(timeSig.split('/')[0]) || 4;

  const metro = useMetronome({ bpm, beatsPerMeasure: beats, subdivision, volume: metroVolume });

  const playNoteRef = useRef(playNote);
  playNoteRef.current = playNote;

  // Snapshot of mutable state accessible inside callbacks without re-creating them
  const S = useRef({});
  S.current = { clef, tier, accidentals, bpm, timeSig, currentMeasure, measureIndex, activeClef, isPlaying, phase };

  const recordNoteMissRef = useRef(recordNoteMiss);
  recordNoteMissRef.current = recordNoteMiss;

  // ── Generate next measure ────────────────────────────────────────────────
  const nextMeasure = useCallback(() => {
    const s = S.current;
    const resolvedClef = s.clef === 'both'
      ? (Math.random() < 0.5 ? 'treble' : 'bass')
      : s.clef;
    if (s.clef === 'both') setActiveClef(resolvedClef);

    const t     = TIERS[s.tier];
    const bs    = parseInt(s.timeSig.split('/')[0]) || 4;
    const range = getEffectiveRange(resolvedClef, s.tier);

    setCurrentMeasure(generateMeasure(range.low, range.high, bs, t.cx, s.accidentals || t.ac));
    setMeasureIndex(0);
    setMeasureResult(null);
    setTimingInfo(null);
  }, []);

  // ── Count-in then show measure ───────────────────────────────────────────
  const startWithCountIn = useCallback(() => {
    setPhase('countIn');
    nextMeasure();
    metro.start({
      countIn: beats,
      onCountInDone: () => setPhase('playing'),
    });
  }, [metro, beats, nextMeasure]);

  // ── isPlaying lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      const fresh = freshSession();
      sessionRef.current = fresh;
      setSession(fresh);
      setHistory([]);
      startWithCountIn();
    } else {
      metro.stop();
      clearTimeout(resultTimeout.current);
      clearTimeout(timingTimeout.current);
      setCurrentMeasure(null);
      setMeasureResult(null);
      setTimingInfo(null);
      setPhase('idle');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Note-on handler ──────────────────────────────────────────────────────
  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if (s.phase !== 'playing' || !s.currentMeasure || s.measureIndex >= s.currentMeasure.length) return;

    // Timing accuracy relative to last beat
    const rawError = performance.now() - metro.lastBeatMsRef.current;
    // Normalise: if the error is > half a beat, the player was early for next beat
    const halfBeatMs = (60 / bpm) * 500;
    const normError  = rawError > halfBeatMs ? rawError - halfBeatMs * 2 : rawError;

    const ok = midi === s.currentMeasure[s.measureIndex].midi;

    // Show timing feedback for correct notes
    if (ok) {
      const info = getTimingLabel(normError);
      setTimingInfo(info);
      clearTimeout(timingTimeout.current);
      timingTimeout.current = setTimeout(() => setTimingInfo(null), 900);
    }

    if (ok) {
      playNoteRef.current(s.currentMeasure[s.measureIndex].midi);
      setCurrentMeasure(prev => {
        const next = [...prev];
        next[s.measureIndex] = { ...next[s.measureIndex], played: true };
        return next;
      });

      if (s.measureIndex + 1 >= s.currentMeasure.length) {
        // Measure complete
        setMeasureResult('pass');
        setSession(p => { const n = { at: p.at + 1, co: p.co + 1 }; sessionRef.current = n; return n; });
        setHistory(h => [...h.slice(-49), true]);
        metro.stop();
        clearTimeout(resultTimeout.current);
        resultTimeout.current = setTimeout(() => {
          setMeasureResult(null);
          startWithCountIn();
        }, 1400);
      } else {
        setMeasureIndex(s.measureIndex + 1);
      }
    } else {
      playNoteRef.current(s.currentMeasure[s.measureIndex].midi, 0.2);
      recordNoteMissRef.current(s.currentMeasure[s.measureIndex].midi);
      setCurrentMeasure(prev => {
        const next = [...prev];
        next[s.measureIndex] = { ...next[s.measureIndex], played: false };
        return next;
      });
      setMeasureResult('fail');
      setSession(p => { const n = { ...p, at: p.at + 1 }; sessionRef.current = n; return n; });
      setHistory(h => [...h.slice(-49), false]);
      metro.stop();
      clearTimeout(resultTimeout.current);
      resultTimeout.current = setTimeout(() => {
        setMeasureResult(null);
        startWithCountIn();
      }, 1400);
    }
  }, [metro, bpm, startWithCountIn]);

  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  const annotatedMeasure = currentMeasure?.map((n, i) => ({
    ...n,
    played:  n.played ?? null,
    current: i === measureIndex && n.played == null,
  }));

  const renderClef     = clef === 'both' ? activeClef : clef;
  const { at, co }     = session;
  const acc            = at > 0 ? Math.round((co / at) * 100) : 0;
  const showStaff      = phase === 'playing' || phase === 'countIn';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Top bar */}
      <div className="top-bar">
        <div className="mode-title">Micro Measure</div>
        <div className="stats-bar">
          <div className="stat-item">
            <div className="stat-value">{acc}%</div>
            <div className="stat-label">Accuracy</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{at}</div>
            <div className="stat-label">Attempts</div>
          </div>
        </div>
      </div>

      {/* Staff area */}
      <div className="staff-area">
        {!isPlaying ? (
          <div className="start-prompt">
            <div className="icon">𝄞</div>
            <p>Play through each measure note by note.<br />A count-in will prepare your tempo before each measure.</p>
            <button className="start-btn" onClick={onStart}>Start Training</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            {showStaff && annotatedMeasure && (
              <StaffDisplay
                measureNotes={phase === 'playing' ? annotatedMeasure : null}
                clef={renderClef}
                mode="measure"
                timeSignature={timeSig}
                grandStaff={clef === 'both'}
                activeClef={activeClef}
                showNoteNames={showNoteNames}
              />
            )}
            {/* Count-in overlay — shows big beat number before measure starts */}
            {phase === 'countIn' && (
              <div className="count-in-overlay">
                <div className="count-in-num">{(metro.countInBeat ?? 0) + 1}</div>
                <div className="count-in-text">Get Ready...</div>
              </div>
            )}
            {measureResult && (
              <div className={`measure-result ${measureResult === 'pass' ? 'pass' : 'fail'}`}>
                {measureResult === 'pass' ? 'Perfect! ✓' : 'Try again'}
              </div>
            )}
            {timingInfo && phase === 'playing' && (
              <div className={`timing-label ${timingInfo.cls}`}>{timingInfo.label}</div>
            )}
            <button className="stop-btn" onClick={() => onStop({ total_attempts: sessionRef.current.at, total_correct: sessionRef.current.co })}>
              Stop
            </button>
          </div>
        )}
      </div>

      {/* History dots */}
      {history.length > 0 && (
        <div className="history-panel">
          <div className="history-dots">
            {history.map((c, i) => <div key={i} className={`history-dot ${c ? 'correct' : 'incorrect'}`} />)}
          </div>
        </div>
      )}

      {/* Bottom bar — metronome */}
      {isPlaying && (
        <div className="bottom-bar">
          <button className="play-btn" onClick={metro.running ? metro.stop : () => startWithCountIn()}>
            {metro.running ? '⏸' : '▶'}
          </button>

          <BeatIndicator
            currentBeat={metro.currentBeat}
            countInBeat={metro.countInBeat}
            countingIn={metro.countingIn}
            beatsPerMeasure={beats}
            subdivision={subdivision}
            currentSubBeat={metro.currentSubBeat}
          />

          <div className="metronome-display">
            <div>
              <div className="bpm-display">{bpm}</div>
              <div className="bpm-label">BPM</div>
            </div>
          </div>

          {/* Subdivision selector */}
          <div className="subdivision-selector">
            <div className="bpm-label" style={{ marginBottom: 4 }}>Subdivision</div>
            <div className="btn-group">
              {[1, 2, 4].map(s => (
                <button
                  key={s}
                  className={subdivision === s ? 'active' : ''}
                  onClick={() => setSubdivision(s)}
                  title={s === 1 ? 'Quarter notes' : s === 2 ? 'Eighth notes' : 'Sixteenth notes'}
                >
                  {SUBDIVISION_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
