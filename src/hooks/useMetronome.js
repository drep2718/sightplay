import { useRef, useCallback, useState } from 'react';

const LOOKAHEAD_MS     = 25;   // How often the scheduler checks (ms)
const SCHEDULE_AHEAD_S = 0.12; // How far ahead to schedule (seconds)

/**
 * Precision Web Audio metronome using lookahead scheduling.
 * Eliminates the ~10–20ms/min drift of setInterval-based approaches.
 *
 * @param {{ bpm: number, beatsPerMeasure: number, subdivision?: number }} props
 *   subdivision: 1 = quarter-note clicks, 2 = eighth-note clicks, 4 = sixteenth-note clicks
 *
 * @returns {{
 *   running:        boolean,
 *   countingIn:     boolean,
 *   currentBeat:    number,   // 0-indexed beat within measure, -1 when stopped
 *   countInBeat:    number,   // 0-indexed beat during count-in, -1 otherwise
 *   currentSubBeat: number,   // 0-indexed sub-beat within beat
 *   lastBeatMsRef:  React.MutableRefObject<number>, // performance.now() of last main beat
 *   start:          (opts?: { countIn?: number, onCountInDone?: () => void }) => void,
 *   stop:           () => void,
 * }}
 */
export function useMetronome({ bpm, beatsPerMeasure, subdivision = 1, volume = 1 }) {
  const [running,        setRunning]        = useState(false);
  const [countingIn,     setCountingIn]     = useState(false);
  const [currentBeat,    setCurrentBeat]    = useState(-1);
  const [countInBeat,    setCountInBeat]    = useState(-1);
  const [currentSubBeat, setCurrentSubBeat] = useState(0);

  // Audio + scheduler
  const ctxRef          = useRef(null);
  const timerRef        = useRef(null);
  const nextNoteTimeRef = useRef(0);

  // Beat position
  const beatRef    = useRef(0);
  const subRef     = useRef(0);

  // Count-in state
  const countingInRef    = useRef(false);
  const countInTotalRef  = useRef(0);   // beats to count in
  const countInFiredRef  = useRef(0);   // main beats fired so far
  const onCountInDoneRef = useRef(null);

  // Timing export — performance.now() when last main beat actually fires
  const lastBeatMsRef = useRef(0);

  // Live-updated param refs (avoid stale closures in the scheduler)
  const bpmRef             = useRef(bpm);
  const beatsPerMeasureRef = useRef(beatsPerMeasure);
  const subdivisionRef     = useRef(subdivision);
  const volumeRef          = useRef(volume);
  bpmRef.current             = bpm;
  beatsPerMeasureRef.current = beatsPerMeasure;
  subdivisionRef.current     = subdivision;
  volumeRef.current          = Math.max(0, Math.min(1, volume));

  // ── Audio click ───────────────────────────────────────────────────────────
  const scheduleClick = useCallback((time, freq, volume) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    osc.start(time);
    osc.stop(time + 0.055);
  }, []);

  // ── Lookahead scheduler ────────────────────────────────────────────────────
  // Stored as a ref so the recursive setTimeout always calls the latest version
  // without adding it to any dependency array.
  const schedulerFnRef = useRef(null);
  schedulerFnRef.current = () => {
    const ctx  = ctxRef.current;
    if (!ctx) return;

    const bpm_  = bpmRef.current;
    const bpM   = beatsPerMeasureRef.current;
    const sub   = subdivisionRef.current;
    const subIntervalS = 60 / bpm_ / sub;

    while (nextNoteTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD_S) {
      const time       = nextNoteTimeRef.current;
      const isMain     = subRef.current === 0;
      const isAccent   = isMain && beatRef.current === 0;
      const isSub      = !isMain;

      // Pitch / volume per click type
      const freq   = isAccent ? 1100 : isSub ? 580 : 850;
      const volBase = isAccent ? 0.18 : isSub ? 0.04 : 0.10;
      const vol     = volBase * volumeRef.current;
      scheduleClick(time, freq, vol);

      // Schedule the React state update to fire at the click time
      if (isMain) {
        const beat    = beatRef.current;
        const isCI    = countingInRef.current;
        const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);

        // Update lastBeatMsRef optimistically so timing calcs work
        // (true value set in the setTimeout below)
        lastBeatMsRef.current = performance.now() + delayMs;

        setTimeout(() => {
          lastBeatMsRef.current = performance.now();

          if (isCI) {
            setCountInBeat(beat);
            countInFiredRef.current += 1;
            if (countInFiredRef.current >= countInTotalRef.current) {
              // Count-in complete — switch to playing
              countingInRef.current = false;
              setCountingIn(false);
              setCountInBeat(-1);
              // beatRef naturally wrapped to 0 because countInTotal === beatsPerMeasure
              setCurrentBeat(beatRef.current);
              onCountInDoneRef.current?.();
            }
          } else {
            setCurrentBeat(beat);
          }
        }, delayMs);

      } else if (sub > 1) {
        const subBeat = subRef.current;
        const delayMs = Math.max(0, (time - ctx.currentTime) * 1000);
        setTimeout(() => setCurrentSubBeat(subBeat), delayMs);
      }

      // Advance counters
      subRef.current = (subRef.current + 1) % sub;
      if (subRef.current === 0) {
        beatRef.current = (beatRef.current + 1) % bpM;
      }
      nextNoteTimeRef.current += subIntervalS;
    }

    timerRef.current = setTimeout(() => schedulerFnRef.current?.(), LOOKAHEAD_MS);
  };

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    countingInRef.current = false;
    setRunning(false);
    setCountingIn(false);
    setCurrentBeat(-1);
    setCountInBeat(-1);
    setCurrentSubBeat(0);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const start = useCallback((opts = {}) => {
    // Clear any running scheduler
    clearTimeout(timerRef.current);
    timerRef.current = null;

    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    // Reset beat position
    beatRef.current = 0;
    subRef.current  = 0;

    // Schedule first note 50ms from now to avoid click on the exact AudioContext start
    nextNoteTimeRef.current = ctx.currentTime + 0.05;

    const { countIn = 0, onCountInDone } = opts;

    if (countIn > 0) {
      countingInRef.current   = true;
      countInTotalRef.current = countIn;
      countInFiredRef.current = 0;
      onCountInDoneRef.current = onCountInDone ?? null;
      setCountingIn(true);
      setCurrentBeat(-1);
      setCountInBeat(0);
    } else {
      countingInRef.current = false;
      setCountingIn(false);
      setCurrentBeat(0);
    }

    setRunning(true);
    schedulerFnRef.current?.();
  }, []);

  return {
    running,
    countingIn,
    currentBeat,
    countInBeat,
    currentSubBeat,
    lastBeatMsRef,
    start,
    stop,
  };
}
