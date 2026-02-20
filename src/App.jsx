import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'; // useMemo used for kbRange
import Sidebar from './components/Sidebar.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import KeyboardViz, { getKbRange } from './components/KeyboardViz.jsx';
import FlashMode from './components/modes/FlashMode.jsx';
import IntervalMode from './components/modes/IntervalMode.jsx';
import MeasureMode from './components/modes/MeasureMode.jsx';
import SheetMusicMode from './components/modes/SheetMusicMode.jsx';
import { useMidi } from './hooks/useMidi.js';
import { useStore } from './store/index.js';

// Computer keyboard → MIDI note fallback (C4=60 .. C5=72)
const KEY_MAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64,
  f: 65, t: 66, g: 67, y: 68, h: 69,
  u: 70, j: 71, k: 72,
};

export default function App() {
  const {
    mode,
    showKeyboard, kbSize, detectedMidiRange,
    pressedKeys,
    addPressedKey, removePressedKey, updateDetectedRange,
    resetSession,
  } = useStore();

  const [isPlaying, setIsPlaying] = useState(false);

  // Each active mode registers its noteOn handler here.
  // Using a ref avoids stale closures and prevents unnecessary re-renders.
  const activeModeHandlerRef = useRef(null);

  /** Called by mode components to register/unregister their handler. */
  const registerModeHandler = useCallback((fn) => {
    activeModeHandlerRef.current = fn ?? null;
  }, []);

  /** Central MIDI note-on dispatcher */
  const handleNoteOn = useCallback((midi) => {
    activeModeHandlerRef.current?.(midi);
  }, []);

  // Wire hardware MIDI
  useMidi(handleNoteOn);

  // Computer keyboard fallback
  useEffect(() => {
    const down = (e) => {
      if (e.repeat) return;
      const midi = KEY_MAP[e.key.toLowerCase()];
      if (midi == null) return;
      addPressedKey(midi);
      updateDetectedRange(midi);
      handleNoteOn(midi);
    };
    const up = (e) => {
      const midi = KEY_MAP[e.key.toLowerCase()];
      if (midi != null) removePressedKey(midi);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [addPressedKey, removePressedKey, updateDetectedRange, handleNoteOn]);

  const startSession = useCallback(() => { resetSession(); setIsPlaying(true); }, [resetSession]);
  const stopSession  = useCallback(() => setIsPlaying(false), []);

  // Stop the session whenever the mode changes
  useEffect(() => { setIsPlaying(false); }, [mode]);

  const kbRange = useMemo(
    () => getKbRange(kbSize, detectedMidiRange),
    [kbSize, detectedMidiRange]
  );

  const modeProps = {
    isPlaying,
    onStart: startSession,
    onStop: stopSession,
    registerModeHandler,
  };

  return (
    <div className="app-layout">
      <Sidebar
        isPlaying={isPlaying}
        onModeChange={stopSession}
        onStopSession={stopSession}
      />

      <div className="main-content">
        {mode === 'flash'    && <FlashMode    {...modeProps} />}
        {mode === 'interval' && <IntervalMode {...modeProps} />}
        {mode === 'measure'  && <MeasureMode  {...modeProps} />}
        {mode === 'sheet'    && <SheetMusicMode {...modeProps} />}

        {showKeyboard && (
          <KeyboardViz
            pressedKeys={pressedKeys}
            targetKeys={[]}
            midiLow={kbRange.lo}
            midiHigh={kbRange.hi}
          />
        )}
      </div>

      <StatsPanel />
    </div>
  );
}
