import React from 'react';
import { useStore } from '../store/index.js';
import { TIERS } from '../utils/generators.js';
import { countWhiteKeys } from '../utils/noteUtils.js';

const MODES = [
  { id: 'flash',    icon: '♩', label: 'Flash Note' },
  { id: 'interval', icon: '♬', label: 'Interval Training' },
  { id: 'measure',  icon: '𝄞', label: 'Micro Measure' },
  { id: 'sheet',    icon: '♪', label: 'Sheet Music' },
];

const CLEFS = [
  { id: 'treble', label: '𝄞 Treble' },
  { id: 'bass',   label: '𝄢 Bass' },
  { id: 'both',   label: 'Both' },
];

export default function Sidebar({ onModeChange, isPlaying, onStopSession }) {
  const {
    midiStatus, midiInputs, selectedInput, setSelectedInput,
    mode, setMode,
    clef, setClef,
    tier, setTier,
    accidentals, setAccidentals,
    showKeyboard, setShowKeyboard,
    kbSize, setKbSize,
    bpm, setBpm,
    timeSig, setTimeSig,
    intervalMax, setIntervalMax,
    detectedMidiRange,
  } = useStore();

  function handleModeClick(newMode) {
    if (isPlaying) onStopSession();
    setMode(newMode);
    onModeChange?.(newMode);
  }

  function handleClefClick(newClef) {
    if (isPlaying) onStopSession();
    setClef(newClef);
  }

  function handleTierClick(newTier) {
    if (isPlaying) onStopSession();
    setTier(newTier);
  }

  const midiDotClass = `midi-dot ${midiStatus}`;
  const midiLabel =
    midiStatus === 'connected'   ? 'Connected' :
    midiStatus === 'searching'   ? 'Searching…' :
    midiStatus === 'unavailable' ? 'MIDI unavailable' :
    'No MIDI device';

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo">MicroSight</div>
        <div className="logo-sub">Sightreading Trainer</div>
      </div>

      {/* MIDI */}
      <div className="sidebar-section">
        <div className="section-title">MIDI Connection</div>
        <div className="midi-status">
          <div className={midiDotClass} />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{midiLabel}</span>
        </div>
        {midiInputs.length > 0 && (
          <select
            className="midi-select"
            value={selectedInput || ''}
            onChange={e => setSelectedInput(e.target.value)}
          >
            {midiInputs.map(i => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
        )}
        {midiStatus !== 'connected' && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Keyboard fallback: A–K = C4–C5, W/E/T/Y/U = sharps
          </div>
        )}
      </div>

      {/* Mode */}
      <div className="sidebar-section">
        <div className="section-title">Training Mode</div>
        <div className="mode-tabs">
          {MODES.map(m => (
            <button
              key={m.id}
              className={`mode-tab${mode === m.id ? ' active' : ''}`}
              onClick={() => handleModeClick(m.id)}
            >
              <div className="mode-icon">{m.icon}</div>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="sidebar-section">
        <div className="section-title">Settings</div>

        {/* Clef (not shown for sheet mode – file determines it) */}
        {mode !== 'sheet' && (
          <div className="setting-row">
            <span className="setting-label">Clef</span>
            <div className="btn-group">
              {CLEFS.map(c => (
                <button
                  key={c.id}
                  className={clef === c.id ? 'active' : ''}
                  onClick={() => handleClefClick(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="setting-row" style={{ marginTop: 8 }}>
          <span className="setting-label">Accidentals</span>
          <button
            className={`toggle-switch${accidentals ? ' on' : ''}`}
            onClick={() => setAccidentals(!accidentals)}
          />
        </div>

        <div className="setting-row" style={{ marginTop: 8 }}>
          <span className="setting-label">Show Keyboard</span>
          <button
            className={`toggle-switch${showKeyboard ? ' on' : ''}`}
            onClick={() => setShowKeyboard(!showKeyboard)}
          />
        </div>

        {showKeyboard && (
          <div style={{ marginTop: 8 }}>
            <div className="setting-row">
              <span className="setting-label">Keyboard Size</span>
              {kbSize === 'auto' && (
                <span className="setting-value" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  {detectedMidiRange.lo < 48
                    ? `${countWhiteKeys(detectedMidiRange.lo, detectedMidiRange.hi)} keys`
                    : 'Play to detect'}
                </span>
              )}
            </div>
            <div className="kb-size-row">
              {['auto', '25', '37', '49', '61', '76', '88'].map(s => (
                <button
                  key={s}
                  className={`kb-size-btn${kbSize === s ? ' active' : ''}`}
                  onClick={() => setKbSize(s)}
                >
                  {s === 'auto' ? 'Auto' : s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'measure' && (
          <>
            <div className="slider-row" style={{ marginTop: 12 }}>
              <div className="setting-row">
                <span className="setting-label">BPM</span>
                <span className="setting-value">{bpm}</span>
              </div>
              <input type="range" min={40} max={180} value={bpm} onChange={e => setBpm(+e.target.value)} />
            </div>
            <div className="setting-row" style={{ marginTop: 8 }}>
              <span className="setting-label">Time Sig</span>
              <div className="btn-group">
                {['3/4', '4/4'].map(t => (
                  <button key={t} className={timeSig === t ? 'active' : ''} onClick={() => setTimeSig(t)}>{t}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {mode === 'interval' && (
          <div className="slider-row" style={{ marginTop: 12 }}>
            <div className="setting-row">
              <span className="setting-label">Max Interval</span>
              <span className="setting-value">{intervalMax} st</span>
            </div>
            <input type="range" min={2} max={12} value={intervalMax} onChange={e => setIntervalMax(+e.target.value)} />
          </div>
        )}
      </div>

      {/* Tier (not shown for sheet mode) */}
      {mode !== 'sheet' && (
        <div className="sidebar-section">
          <div className="section-title">Difficulty Tier</div>
          <div className="tier-selector">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(t => (
              <button
                key={t}
                className={`tier-btn${tier === t ? ' active' : ''}`}
                onClick={() => handleTierClick(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.5 }}>
            {TIERS[tier]?.label}
          </div>
        </div>
      )}
    </div>
  );
}
