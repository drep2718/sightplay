import React, { useState, useRef, useCallback, useEffect } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import { useStore } from '../../store/index.js';
import { midiToDisplayName } from '../../utils/noteUtils.js';
import {
  generateRandomNote,
  generateChord,
  getEffectiveRange,
  TIERS,
} from '../../utils/generators.js';

function freshSession() { return { at: 0, co: 0, rt: [] }; }

function buildFinalStats(session) {
  const { at, co, rt } = session;
  const best = rt.length > 0 ? Math.min(...rt) : null;
  const avg  = rt.length > 0 ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : null;
  return { total_attempts: at, total_correct: co, best_reaction: best, avg_reaction: avg, reaction_times: rt };
}

export default function FlashMode({ isPlaying, onStart, onStop, registerModeHandler }) {
  const { clef, tier, accidentals, recordAttempt } = useStore();
  const pressedKeys = useStore(s => s.pressedKeys);

  const [currentNote, setCurrentNote] = useState(null); // number[]
  const [activeClef, setActiveClef]   = useState('treble');
  const [feedback, setFeedback]       = useState(null);
  const [session, setSession]         = useState(freshSession);
  const [history, setHistory]         = useState([]);
  const sessionRef                    = useRef(freshSession());

  // Keep volatile state in a ref so the handler never goes stale
  const S = useRef({});
  S.current = { clef, tier, accidentals, currentNote, activeClef, isPlaying, session };

  // Mirror pressedKeys in a ref (avoids stale closure without causing handler recreation)
  const pressedKeysRef = useRef(pressedKeys);
  useEffect(() => { pressedKeysRef.current = pressedKeys; }, [pressedKeys]);

  const noteStartTime   = useRef(null);
  const feedbackTimeout = useRef(null);

  const clearFeedbackTimer = () => {
    if (feedbackTimeout.current) { clearTimeout(feedbackTimeout.current); feedbackTimeout.current = null; }
  };

  const nextNote = useCallback(() => {
    const s = S.current;
    const resolvedClef = s.clef === 'both'
      ? (Math.random() < 0.5 ? 'treble' : 'bass')
      : s.clef;
    if (s.clef === 'both') setActiveClef(resolvedClef);

    const t = TIERS[s.tier];
    const useAcc = s.accidentals || t.ac;
    const range  = getEffectiveRange(resolvedClef, s.tier);
    const note   = t.ch > 1
      ? generateChord(range.low, range.high, t.ch, useAcc)
      : [generateRandomNote(range.low, range.high, useAcc)];

    setCurrentNote(note);
    setFeedback(null);
    noteStartTime.current = Date.now();
  }, []); // stable — reads S.current at call-time

  // Start / stop
  useEffect(() => {
    if (isPlaying) {
      const fresh = freshSession();
      sessionRef.current = fresh;
      setSession(fresh);
      setHistory([]);
      nextNote();
    } else {
      clearFeedbackTimer();
      setCurrentNote(null);
      setFeedback(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Note-on handler — stable (no direct state in deps)
  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if (!s.isPlaying || !s.currentNote?.length) return;

    const rt      = noteStartTime.current ? Date.now() - noteStartTime.current : null;
    const isChord = s.currentNote.length > 1;

    if (isChord) {
      const keys      = [...new Set([...pressedKeysRef.current, midi])];
      const allHeld   = s.currentNote.every(n => keys.includes(n));
      const wrongNote = !s.currentNote.includes(midi);

      if (allHeld) {
        setFeedback('correct');
        setSession(p => { const n = { at: p.at + 1, co: p.co + 1, rt: rt ? [...p.rt, rt] : p.rt }; sessionRef.current = n; return n; });
        setHistory(h => [...h.slice(-49), true]);
        recordAttempt(true, rt);
        clearFeedbackTimer();
        feedbackTimeout.current = setTimeout(nextNote, 500);
      } else if (wrongNote) {
        setFeedback('incorrect');
        setSession(p => { const n = { ...p, at: p.at + 1 }; sessionRef.current = n; return n; });
        setHistory(h => [...h.slice(-49), false]);
        recordAttempt(false, null);
        clearFeedbackTimer();
        feedbackTimeout.current = setTimeout(() => setFeedback(null), 500);
      }
    } else {
      const ok = midi === s.currentNote[0];
      setFeedback(ok ? 'correct' : 'incorrect');
      setSession(p => { const n = { at: p.at + 1, co: p.co + (ok ? 1 : 0), rt: ok && rt ? [...p.rt, rt] : p.rt }; sessionRef.current = n; return n; });
      setHistory(h => [...h.slice(-49), ok]);
      recordAttempt(ok, ok ? rt : null);
      clearFeedbackTimer();
      feedbackTimeout.current = ok
        ? setTimeout(nextNote, 400)
        : setTimeout(() => setFeedback(null), 500);
    }
  }, [nextNote, recordAttempt]); // stable

  // Register handler with App
  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  const renderClef = clef === 'both' ? activeClef : clef;
  const { at, co, rt } = session;
  const acc   = at > 0 ? Math.round((co / at) * 100) : 0;
  const avgRt = rt.length > 0 ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0;

  const noteLabel = () => {
    if (!currentNote?.length) return '';
    if (feedback)              return currentNote.map(midiToDisplayName).join(' + ');
    return currentNote.length > 1 ? 'Play chord' : '?';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div className="top-bar">
        <div className="mode-title">Flash Note</div>
        <div className="stats-bar">
          <div className="stat-item"><div className="stat-value">{acc}%</div><div className="stat-label">Accuracy</div></div>
          <div className="stat-item"><div className="stat-value">{avgRt || '—'}</div><div className="stat-label">Avg ms</div></div>
          <div className="stat-item"><div className="stat-value">{at}</div><div className="stat-label">Attempts</div></div>
        </div>
      </div>

      <div className="staff-area">
        <div className={`feedback-overlay${feedback ? ` ${feedback}` : ''}`}>
          {feedback === 'correct'   && <div className="feedback-icon" style={{ color: 'var(--correct-green)' }}>✓</div>}
          {feedback === 'incorrect' && <div className="feedback-icon" style={{ color: 'var(--incorrect-red)' }}>✗</div>}
        </div>

        {!isPlaying ? (
          <div className="start-prompt">
            <div className="icon">𝄞</div>
            <p>Connect your MIDI keyboard or use computer keys (A–K). Press Start to begin.</p>
            <button className="start-btn" onClick={onStart}>Start Training</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            <StaffDisplay
              notes={currentNote}
              clef={renderClef}
              feedback={feedback}
              grandStaff={clef === 'both'}
              activeClef={activeClef}
            />
            <div className={`note-name-display${feedback ? ` ${feedback}` : ''}`}>{noteLabel()}</div>
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
    </div>
  );
}
