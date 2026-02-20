import { useRef, useCallback, useState } from 'react';

/**
 * Web Audio API metronome.
 * @returns {{ running: boolean, currentBeat: number, start: () => void, stop: () => void }}
 */
export function useMetronome({ bpm, beatsPerMeasure }) {
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);
  const beatRef = useRef(0);

  const click = useCallback((accent) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = accent ? 1000 : 800;
    gain.gain.value = accent ? 0.15 : 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }, []);

  const start = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    beatRef.current = 0;
    setCurrentBeat(0);
    setRunning(true);
    click(true);

    intervalRef.current = setInterval(() => {
      beatRef.current = (beatRef.current + 1) % beatsPerMeasure;
      setCurrentBeat(beatRef.current);
      click(beatRef.current === 0);
    }, (60 / bpm) * 1000);
  }, [bpm, beatsPerMeasure, click]);

  const stop = useCallback(() => {
    setRunning(false);
    setCurrentBeat(-1);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { running, currentBeat, start, stop };
}
