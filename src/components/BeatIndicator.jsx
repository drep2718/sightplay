import React, { useEffect, useRef } from 'react';

/**
 * Visual beat indicator that pulses in sync with the metronome.
 *
 * Props:
 *   currentBeat      — 0-indexed beat within measure (-1 = stopped)
 *   countInBeat      — 0-indexed beat during count-in (-1 = not counting in)
 *   countingIn       — bool: currently in count-in phase
 *   beatsPerMeasure  — e.g. 4
 *   subdivision      — 1 | 2 | 4
 *   currentSubBeat   — 0-indexed sub-beat within beat
 */
export default function BeatIndicator({
  currentBeat,
  countInBeat,
  countingIn,
  beatsPerMeasure,
  subdivision = 1,
  currentSubBeat = 0,
}) {
  const displayBeat = countingIn ? countInBeat : currentBeat;
  const beatNumRef  = useRef(null);

  // Trigger CSS animation every time the beat changes
  useEffect(() => {
    const el = beatNumRef.current;
    if (!el || displayBeat < 0) return;
    el.classList.remove('beat-pop');
    // Force reflow so removing + re-adding the class triggers the animation
    void el.offsetWidth;
    el.classList.add('beat-pop');
  }, [displayBeat]);

  const isAccent = displayBeat === 0 && !countingIn;

  return (
    <div className="beat-indicator">
      {/* Large beat number */}
      <div
        ref={beatNumRef}
        className={`beat-num${isAccent ? ' accent' : ''}${countingIn ? ' count-in' : ''}`}
      >
        {displayBeat >= 0 ? displayBeat + 1 : '—'}
      </div>

      {/* Beat pips row */}
      <div className="beat-pips">
        {Array.from({ length: beatsPerMeasure }).map((_, i) => (
          <div
            key={i}
            className={`beat-pip${displayBeat === i ? ' active' : ''}${displayBeat === i && i === 0 && !countingIn ? ' accent' : ''}`}
          />
        ))}
      </div>

      {/* Subdivision ticks — only shown when subdivision > 1 */}
      {subdivision > 1 && displayBeat >= 0 && (
        <div className="sub-ticks">
          {Array.from({ length: subdivision }).map((_, i) => (
            <div
              key={i}
              className={`sub-tick${currentSubBeat === i ? ' active' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Count-in label */}
      {countingIn && (
        <div className="count-in-label">Count In</div>
      )}
    </div>
  );
}
