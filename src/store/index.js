import { create } from 'zustand';
import { loadStats, saveStats } from '../utils/noteUtils.js';

export const useStore = create((set, get) => ({
  // ── MIDI ──────────────────────────────────────────
  midiAccess: null,
  midiInputs: [],
  selectedInput: null,
  /** 'unavailable' | 'disconnected' | 'searching' | 'connected' */
  midiStatus: 'disconnected',
  pressedKeys: [],
  detectedMidiRange: { lo: 48, hi: 72 },

  setMidiAccess:    (access)  => set({ midiAccess: access }),
  setMidiInputs:    (inputs)  => set({ midiInputs: inputs }),
  setSelectedInput: (idOrFn)  => set(s => ({
    selectedInput: typeof idOrFn === 'function' ? idOrFn(s.selectedInput) : idOrFn,
  })),
  setMidiStatus:    (status)  => set({ midiStatus: status }),

  addPressedKey:    (note)    => set(s => ({ pressedKeys: [...new Set([...s.pressedKeys, note])] })),
  removePressedKey: (note)    => set(s => ({ pressedKeys: s.pressedKeys.filter(k => k !== note) })),
  clearPressedKeys: ()        => set({ pressedKeys: [] }),

  updateDetectedRange: (note) => set(s => {
    const { lo, hi } = s.detectedMidiRange;
    if (note >= lo && note <= hi) return {};
    return { detectedMidiRange: { lo: Math.min(lo, note), hi: Math.max(hi, note) } };
  }),

  // ── Settings ──────────────────────────────────────
  /** 'flash' | 'interval' | 'measure' | 'sheet' */
  mode:         'flash',
  /** 'treble' | 'bass' | 'both' */
  clef:         'treble',
  tier:         1,
  accidentals:  false,
  showKeyboard: true,
  /** 'auto' | '25' | '37' | '49' | '61' | '76' | '88' */
  kbSize:       'auto',
  bpm:          80,
  timeSig:      '4/4',
  intervalMax:  8,

  setMode:        (mode)    => set({ mode }),
  setClef:        (clef)    => set({ clef }),
  setTier:        (tier)    => set({ tier }),
  setAccidentals: (v)       => set({ accidentals: v }),
  setShowKeyboard:(v)       => set({ showKeyboard: v }),
  setKbSize:      (size)    => set({ kbSize: size }),
  setBpm:         (bpm)     => set({ bpm }),
  setTimeSig:     (sig)     => set({ timeSig: sig }),
  setIntervalMax: (max)     => set({ intervalMax: max }),

  // ── Session stats (reset on each new session) ─────
  session: { at: 0, co: 0, rt: [] },

  resetSession: () => set({ session: { at: 0, co: 0, rt: [] } }),

  // ── All-time stats ────────────────────────────────
  stats: loadStats(),

  /**
   * Record a single attempt. Updates both session and all-time stats.
   * @param {boolean} correct
   * @param {number|null} reactionTimeMs
   */
  recordAttempt: (correct, reactionTimeMs) => {
    // Update session stats
    set(s => ({
      session: {
        at: s.session.at + 1,
        co: s.session.co + (correct ? 1 : 0),
        rt: correct && reactionTimeMs != null ? [...s.session.rt, reactionTimeMs] : s.session.rt,
      },
    }));

    // Update all-time stats
    const prev    = get().stats;
    const updated = {
      ta: prev.ta + 1,
      tc: prev.tc + (correct ? 1 : 0),
      br:
        correct && reactionTimeMs != null
          ? prev.br != null ? Math.min(prev.br, reactionTimeMs) : reactionTimeMs
          : prev.br,
      rt:
        correct && reactionTimeMs != null
          ? [...(prev.rt ?? []).slice(-99), reactionTimeMs]
          : prev.rt,
    };
    saveStats(updated);
    set({ stats: updated });
  },
}));
