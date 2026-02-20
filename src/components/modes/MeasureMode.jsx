import React, { useState, useRef, useCallback, useEffect } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import { useStore } from '../../store/index.js';
import { generateMeasure, getEffectiveRange, TIERS } from '../../utils/generators.js';
import { useMetronome } from '../../hooks/useMetronome.js';

function freshSession() { return { at: 0, co: 0 }; }

function buildFinalStats(session) {
  const { at, co } = session;
  return { total_attempts: at, total_correct: co };
}

export default function MeasureMode({ isPlaying, onStart, onStop, registerModeHandler }) {
  const { clef, tier, accidentals, bpm, timeSig } = useStore();

  const [currentMeasure, setCurrentMeasure] = useState(null);
  const [measureIndex, setMeasureIndex]     = useState(0);
  const [activeClef, setActiveClef]         = useState('treble');
  const [measureResult, setMeasureResult]   = useState(null);
  const [session, setSession]               = useState(freshSession);
  const [history, setHistory]               = useState([]);
  const sessionRef                          = useRef(freshSession());

  const beats = parseInt(timeSig.split('/')[0]) || 4;
  const metro = useMetronome({ bpm, beatsPerMeasure: beats });

  const S = useRef({});
  S.current = { clef, tier, accidentals, bpm, timeSig, currentMeasure, measureIndex, activeClef, isPlaying };

  const resultTimeout = useRef(null);

  const nextMeasure = useCallback(() => {
    const s = S.current;
    const resolvedClef = s.clef === 'both'
      ? (Math.random() < 0.5 ? 'treble' : 'bass')
      : s.clef;
    if (s.clef === 'both') setActiveClef(resolvedClef);

    const t    = TIERS[s.tier];
    const bs   = parseInt(s.timeSig.split('/')[0]) || 4;
    const range = getEffectiveRange(resolvedClef, s.tier);

    setCurrentMeasure(generateMeasure(range.low, range.high, bs, t.cx, s.accidentals || t.ac));
    setMeasureIndex(0);
    setMeasureResult(null);
    metro.start();
  }, [metro]);

  useEffect(() => {
    if (isPlaying) {
      const fresh = freshSession();
      sessionRef.current = fresh;
      setSession(fresh);
      setHistory([]);
      nextMeasure();
    } else {
      metro.stop();
      if (resultTimeout.current) clearTimeout(resultTimeout.current);
      setCurrentMeasure(null);
      setMeasureResult(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if (!s.isPlaying || !s.currentMeasure || s.measureIndex >= s.currentMeasure.length) return;

    const ok = midi === s.currentMeasure[s.measureIndex].midi;

    if (ok) {
      setCurrentMeasure(prev => {
        const next = [...prev];
        next[s.measureIndex] = { ...next[s.measureIndex], played: true };
        return next;
      });

      if (s.measureIndex + 1 >= s.currentMeasure.length) {
        setMeasureResult('pass');
        setSession(p => { const n = { at: p.at + 1, co: p.co + 1 }; sessionRef.current = n; return n; });
        setHistory(h => [...h.slice(-49), true]);
        metro.stop();
        if (resultTimeout.current) clearTimeout(resultTimeout.current);
        resultTimeout.current = setTimeout(() => { setMeasureResult(null); nextMeasure(); }, 1500);
      } else {
        setMeasureIndex(s.measureIndex + 1);
      }
    } else {
      setCurrentMeasure(prev => {
        const next = [...prev];
        next[s.measureIndex] = { ...next[s.measureIndex], played: false };
        return next;
      });
      setMeasureResult('fail');
      setSession(p => { const n = { ...p, at: p.at + 1 }; sessionRef.current = n; return n; });
      setHistory(h => [...h.slice(-49), false]);
      metro.stop();
      if (resultTimeout.current) clearTimeout(resultTimeout.current);
      resultTimeout.current = setTimeout(() => { setMeasureResult(null); nextMeasure(); }, 1500);
    }
  }, [metro, nextMeasure]);

  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  const annotatedMeasure = currentMeasure?.map((n, i) => ({
    ...n,
    played: n.played ?? null,
    current: i === measureIndex && n.played == null,
  }));

  const renderClef = clef === 'both' ? activeClef : clef;
  const { at, co } = session;
  const acc = at > 0 ? Math.round((co / at) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div className="top-bar">
        <div className="mode-title">Micro Measure</div>
        <div className="stats-bar">
          <div className="stat-item"><div className="stat-value">{acc}%</div><div className="stat-label">Accuracy</div></div>
          <div className="stat-item"><div className="stat-value">{at}</div><div className="stat-label">Attempts</div></div>
        </div>
      </div>

      <div className="staff-area">
        {!isPlaying ? (
          <div className="start-prompt">
            <div className="icon">𝄞</div>
            <p>Play through each measure note by note. A metronome will keep your tempo.</p>
            <button className="start-btn" onClick={onStart}>Start Training</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            <StaffDisplay
              measureNotes={annotatedMeasure}
              clef={renderClef}
              mode="measure"
              timeSignature={timeSig}
              grandStaff={clef === 'both'}
              activeClef={activeClef}
            />
            {measureResult && (
              <div className={`measure-result ${measureResult === 'pass' ? 'pass' : 'fail'}`}>
                {measureResult === 'pass' ? 'Perfect! ✓' : 'Try again'}
              </div>
            )}
            <button className="stop-btn" onClick={() => onStop(buildFinalStats(sessionRef.current))}>Stop</button>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="history-panel">
          <div className="history-dots">
            {history.map((c, i) => <div key={i} className={`history-dot ${c ? 'correct' : 'incorrect'}`} />)}
          </div>
        </div>
      )}

      {isPlaying && (
        <div className="bottom-bar">
          <button className="play-btn" onClick={metro.running ? metro.stop : metro.start}>
            {metro.running ? '⏸' : '▶'}
          </button>
          <div className="metronome-display">
            <div>
              <div className="bpm-display">{bpm}</div>
              <div className="bpm-label">BPM</div>
            </div>
            <div className="beat-dots">
              {Array.from({ length: beats }).map((_, i) => (
                <div key={i} className={`beat-dot${metro.currentBeat === i ? ' active' : ''}`} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
