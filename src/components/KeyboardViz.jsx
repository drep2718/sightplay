import React, { useRef, useState, useEffect } from 'react';
import { isBlackKey, countWhiteKeys, midiToDisplayName } from '../utils/noteUtils.js';

const KB_SIZES = {
  '25': [48, 72],
  '37': [36, 72],
  '49': [36, 84],
  '61': [24, 84],
  '76': [16, 91],
  '88': [21, 108],
};

export function getKbRange(kbSize, detectedRange) {
  if (kbSize !== 'auto') {
    const sz = KB_SIZES[kbSize];
    return sz ? { lo: sz[0], hi: sz[1] } : { lo: 36, hi: 84 };
  }
  // Snap detected range to octave boundaries; ensure ≥2 octaves
  const lo  = Math.max(21, Math.floor(detectedRange.lo / 12) * 12);
  const hi  = Math.min(108, Math.ceil((detectedRange.hi + 1) / 12) * 12 - 1);
  const span = hi - lo;
  if (span < 24) {
    const mid = Math.round((lo + hi) / 2);
    return { lo: Math.max(21, mid - 12), hi: Math.min(108, mid + 12) };
  }
  return { lo, hi };
}

export default function KeyboardViz({ pressedKeys, targetKeys, midiLow, midiHigh }) {
  const containerRef = useRef(null);
  const [keyWidth, setKeyWidth] = useState(18);

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current?.parentElement) return;
      const cw = containerRef.current.parentElement.clientWidth - 24;
      const numWhite = countWhiteKeys(midiLow, midiHigh);
      const w = Math.max(8, Math.min(28, Math.floor(cw / numWhite)));
      setKeyWidth(w);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [midiLow, midiHigh]);

  const blackW = Math.max(6, Math.round(keyWidth * 0.65));
  const whiteKeys = [];
  const blackKeys = [];
  let whiteIndex = 0;

  for (let m = midiLow; m <= midiHigh; m++) {
    if (!isBlackKey(m)) {
      const isC = m % 12 === 0;
      const showLabel = isC || m === midiLow;
      const cls = [
        'key-white',
        pressedKeys.includes(m) ? 'pressed' : '',
        targetKeys.includes(m)  ? 'target'  : '',
      ].filter(Boolean).join(' ');

      whiteKeys.push(
        <div key={`w${m}`} className={cls} style={{ width: keyWidth }} title={midiToDisplayName(m)}>
          {showLabel && <span className="key-label">{midiToDisplayName(m)}</span>}
        </div>
      );
      whiteIndex++;
    } else {
      const leftPx = whiteIndex * keyWidth - blackW / 2;
      const cls = [
        'key-black',
        pressedKeys.includes(m) ? 'pressed' : '',
        targetKeys.includes(m)  ? 'target'  : '',
      ].filter(Boolean).join(' ');

      blackKeys.push(
        <div key={`b${m}`} className="key-black-wrapper" style={{ left: leftPx, width: blackW }}>
          <div className={cls} style={{ width: '100%' }} title={midiToDisplayName(m)} />
        </div>
      );
    }
  }

  const totalWidth = countWhiteKeys(midiLow, midiHigh) * keyWidth;

  return (
    <div className="keyboard-viz" ref={containerRef}>
      <div className="keyboard-inner" style={{ width: totalWidth }}>
        {whiteKeys}
        {blackKeys}
      </div>
    </div>
  );
}
