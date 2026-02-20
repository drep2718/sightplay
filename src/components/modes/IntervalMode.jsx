import React, { useState, useRef, useCallback, useEffect } from 'react';
import StaffDisplay from '../StaffDisplay.jsx';
import { useStore } from '../../store/index.js';
import { midiToDisplayName } from '../../utils/noteUtils.js';
import { generateInterval, getEffectiveRange } from '../../utils/generators.js';

function freshSession() { return { at: 0, co: 0 }; }

export default function IntervalMode({ isPlaying, onStart, onStop, registerModeHandler }) {
  const { clef, tier, intervalMax } = useStore();
  const pressedKeys = useStore(s => s.pressedKeys);

  const [currentInterval, setCurrentInterval] = useState(null); // [lo, hi]
  const [activeClef, setActiveClef]            = useState('treble');
  const [feedback, setFeedback]                = useState(null);
  const [session, setSession]                  = useState(freshSession);
  const [history, setHistory]                  = useState([]);

  const S = useRef({});
  S.current = { clef, tier, intervalMax, currentInterval, activeClef, isPlaying };

  const pressedKeysRef = useRef(pressedKeys);
  useEffect(() => { pressedKeysRef.current = pressedKeys; }, [pressedKeys]);

  const feedbackTimeout = useRef(null);

  const nextInterval = useCallback(() => {
    const s = S.current;
    const resolvedClef = s.clef === 'both'
      ? (Math.random() < 0.5 ? 'treble' : 'bass')
      : s.clef;
    if (s.clef === 'both') setActiveClef(resolvedClef);

    const range = getEffectiveRange(resolvedClef, s.tier);
    setCurrentInterval(generateInterval(range.low, range.high, 2, s.intervalMax));
    setFeedback(null);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      setSession(freshSession());
      setHistory([]);
      nextInterval();
    } else {
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      setCurrentInterval(null);
      setFeedback(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const handleNoteOn = useCallback((midi) => {
    const s = S.current;
    if (!s.isPlaying || !s.currentInterval) return;

    const keys   = [...new Set([...pressedKeysRef.current, midi])];
    const [lo, hi] = s.currentInterval;

    if (keys.includes(lo) && keys.includes(hi)) {
      setFeedback('correct');
      setSession(p => ({ at: p.at + 1, co: p.co + 1 }));
      setHistory(h => [...h.slice(-49), true]);
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(nextInterval, 500);
    } else if (keys.length >= 2) {
      setFeedback('incorrect');
      setSession(p => ({ ...p, at: p.at + 1 }));
      setHistory(h => [...h.slice(-49), false]);
      if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = setTimeout(() => setFeedback(null), 500);
    }
  }, [nextInterval]);

  useEffect(() => {
    registerModeHandler(handleNoteOn);
    return () => registerModeHandler(null);
  }, [handleNoteOn, registerModeHandler]);

  const renderClef = clef === 'both' ? activeClef : clef;
  const { at, co } = session;
  const acc = at > 0 ? Math.round((co / at) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      <div className="top-bar">
        <div className="mode-title">Interval Training</div>
        <div className="stats-bar">
          <div className="stat-item"><div className="stat-value">{acc}%</div><div className="stat-label">Accuracy</div></div>
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
            <div className="icon">♬</div>
            <p>Play both notes of the interval simultaneously. Press Start to begin.</p>
            <button className="start-btn" onClick={onStart}>Start Training</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%' }}>
            <StaffDisplay
              notes={currentInterval}
              clef={renderClef}
              feedback={feedback}
              grandStaff={clef === 'both'}
              activeClef={activeClef}
            />
            <div className={`note-name-display${feedback === 'correct' ? ' correct' : ''}`}>
              {feedback === 'correct' && currentInterval
                ? `${midiToDisplayName(currentInterval[0])} + ${midiToDisplayName(currentInterval[1])}`
                : 'Play both notes'}
            </div>
            <button className="stop-btn" onClick={onStop}>Stop</button>
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
