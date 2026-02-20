import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import KeyboardViz, { getKbRange } from './components/KeyboardViz.jsx';
import FlashMode from './components/modes/FlashMode.jsx';
import IntervalMode from './components/modes/IntervalMode.jsx';
import MeasureMode from './components/modes/MeasureMode.jsx';
import SheetMusicMode from './components/modes/SheetMusicMode.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { useAuth } from './hooks/useAuth.js';
import { useMidi } from './hooks/useMidi.js';
import { useStore } from './store/index.js';
import { api } from './hooks/useApi.js';

// Computer keyboard → MIDI note fallback (C4=60 .. C5=72)
const KEY_MAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64,
  f: 65, t: 66, g: 67, y: 68, h: 69,
  u: 70, j: 71, k: 72,
};

function MainApp() {
  const {
    mode, clef, tier, accidentals, bpm, timeSig, intervalMax,
    showKeyboard, kbSize, detectedMidiRange,
    pressedKeys,
    addPressedKey, removePressedKey, updateDetectedRange,
    resetSession, loadUserData,
  } = useStore();

  const { user } = useAuth();
  const [isPlaying, setIsPlaying]       = useState(false);
  const [sessionId, setSessionId]       = useState(null);
  const activeModeHandlerRef            = useRef(null);

  // Load user data (preferences + stats + migration) after login
  useEffect(() => {
    if (user) {
      loadUserData(user);
    }
  }, [user, loadUserData]);

  // Listen for forced-logout events from the axios interceptor
  useEffect(() => {
    const handler = () => { setIsPlaying(false); };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  const registerModeHandler = useCallback((fn) => {
    activeModeHandlerRef.current = fn ?? null;
  }, []);

  const handleNoteOn = useCallback((midi) => {
    activeModeHandlerRef.current?.(midi);
  }, []);

  useMidi(handleNoteOn);

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

  const startSession = useCallback(async () => {
    resetSession();
    setIsPlaying(true);

    // Create a session record in the DB
    try {
      const { data } = await api.post('/sessions', {
        mode, clef, tier, accidentals, bpm, time_sig: timeSig, interval_max: intervalMax,
      });
      setSessionId(data.session.id);
    } catch { /* non-critical */ }
  }, [resetSession, mode, clef, tier, accidentals, bpm, timeSig, intervalMax]);

  const stopSession = useCallback(async (finalStats) => {
    setIsPlaying(false);

    if (sessionId) {
      try {
        await api.post(`/sessions/${sessionId}/end`, finalStats || {});
      } catch { /* non-critical */ }
      setSessionId(null);
    }
  }, [sessionId]);

  // Stop session when mode changes
  useEffect(() => { setIsPlaying(false); setSessionId(null); }, [mode]);

  const kbRange = useMemo(
    () => getKbRange(kbSize, detectedMidiRange),
    [kbSize, detectedMidiRange]
  );

  const modeProps = { isPlaying, onStart: startSession, onStop: stopSession, registerModeHandler };

  return (
    <div className="app-layout">
      <Sidebar
        isPlaying={isPlaying}
        onModeChange={() => stopSession()}
        onStopSession={() => stopSession()}
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
