let _ctx = null;

function getCtx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

export function useAudioSynth() {
  const playNote = (midi, velocity = 0.65, duration = 0.55) => {
    try {
      const ctx  = getCtx();
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx.currentTime;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(velocity * 0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.start(t);
      osc.stop(t + duration);
    } catch { /* ignore AudioContext errors */ }
  };

  return { playNote };
}
