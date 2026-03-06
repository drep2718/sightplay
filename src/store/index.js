import { create } from 'zustand';
import { api } from '../hooks/useApi.js';

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const LS_PREFS  = 'ms-prefs';
const LS_STATS  = 'ms-stats';
const LS_PIECES = 'ms-pieces';

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

  showNoteNames:  false,
  metroVolume:    1,
  metronomeEnabled: true,
  noteSoundEnabled: true,
  skipCountInOnRestart: false,
  autoLoopRange: false,

  setMode:        (mode)    => set({ mode }),
  setClef:        (clef)    => set({ clef }),
  setTier:        (tier)    => set({ tier }),
  setAccidentals: (v)       => set({ accidentals: v }),
  setShowKeyboard:(v)       => set({ showKeyboard: v }),
  setKbSize:      (size)    => set({ kbSize: size }),
  setBpm:         (bpm)     => set({ bpm }),
  setTimeSig:     (sig)     => set({ timeSig: sig }),
  setIntervalMax: (max)     => set({ intervalMax: max }),
  setShowNoteNames:(v)      => set({ showNoteNames: v }),
  setMetroVolume: (v)       => set({ metroVolume: v }),
  setMetronomeEnabled: (v)  => set({ metronomeEnabled: v }),
  setNoteSoundEnabled: (v)  => set({ noteSoundEnabled: v }),
  setSkipCountInOnRestart: (v) => set({ skipCountInOnRestart: v }),
  setAutoLoopRange: (v)     => set({ autoLoopRange: v }),

  // ── Highlighted keys (for note-click in StaffDisplay) ────────────────────
  highlightedMidi: [],
  setHighlightedMidi: (midis) => set({ highlightedMidi: midis }),

  // ── Note miss heatmap ─────────────────────────────
  noteMissCounts: {},  // { [midi]: count } — correct note they failed to play

  recordNoteMiss: (correctMidi) => set(s => ({
    noteMissCounts: {
      ...s.noteMissCounts,
      [correctMidi]: (s.noteMissCounts[correctMidi] ?? 0) + 1,
    },
  })),
  resetHeatmap: () => set({ noteMissCounts: {} }),

  // ── Piece library ─────────────────────────────────
  pieces: [],

  loadPieces: async () => {
    if (IS_DEMO) {
      try {
        const raw = localStorage.getItem(LS_PIECES);
        set({ pieces: raw ? JSON.parse(raw) : [] });
      } catch { /* non-critical */ }
      return;
    }
    try {
      const { data } = await api.get('/pieces');
      set({ pieces: data.pieces ?? [] });
    } catch { /* non-critical */ }
  },

  setPieces: (pieces) => set({ pieces }),

  // ── Session stats (reset on each new session) ─────
  session: { at: 0, co: 0, rt: [] },

  resetSession: () => set({ session: { at: 0, co: 0, rt: [] } }),

  // ── All-time stats (loaded from API after login) ──
  stats: { ta: 0, tc: 0, br: null, rt: [] },

  // ── Session history (last N sessions, loaded from API) ────
  sessionHistory: [],

  /**
   * Load preferences and stats from the API after login.
   * Also handles the one-time localStorage migration.
   */
  loadUserData: async (user) => {
    if (IS_DEMO) {
      try {
        const raw = localStorage.getItem(LS_PREFS);
        if (raw) set(JSON.parse(raw));
      } catch { /* use defaults */ }
      try {
        const raw = localStorage.getItem(LS_STATS);
        if (raw) set({ stats: JSON.parse(raw) });
      } catch { /* use defaults */ }
      return;
    }

    try {
      // Load preferences
      const { data: prefData } = await api.get('/users/preferences');
      const p = prefData.preferences;
      set({
        mode:             p.mode,
        clef:             p.clef,
        tier:             p.tier,
        accidentals:      p.accidentals,
        showKeyboard:     p.show_keyboard,
        kbSize:           p.kb_size,
        bpm:              p.bpm,
        timeSig:          p.time_sig,
        intervalMax:      p.interval_max,
        showNoteNames:    p.show_note_names    ?? false,
        metroVolume:      p.metro_volume       ?? 1,
        metronomeEnabled: p.metronome_enabled  ?? true,
        noteSoundEnabled: p.note_sound_enabled ?? true,
        skipCountInOnRestart: p.skip_count_in_on_restart ?? false,
        autoLoopRange:    p.auto_loop_range    ?? false,
      });
    } catch { /* use defaults */ }

    try {
      // Load all-time stats
      const { data: statsData } = await api.get('/stats');
      const s = statsData.stats;
      set({
        stats: {
          ta: s.total_attempts,
          tc: s.total_correct,
          br: s.best_reaction,
          rt: s.reaction_times || [],
        },
      });
    } catch { /* use defaults */ }

    try {
      // Load recent session history for the progress chart
      const { data: sessData } = await api.get('/sessions?limit=20');
      set({ sessionHistory: sessData.sessions ?? [] });
    } catch { /* non-critical */ }

    // One-time localStorage migration
    if (!user?.migrated_local_storage) {
      try {
        const raw = localStorage.getItem('microsight-stats');
        if (raw) {
          const local = JSON.parse(raw);
          if (local.ta > 0) {
            await api.put('/stats', local);
            localStorage.removeItem('microsight-stats');
            // Refresh stats from API after migration
            const { data: statsData } = await api.get('/stats');
            const s = statsData.stats;
            set({
              stats: {
                ta: s.total_attempts,
                tc: s.total_correct,
                br: s.best_reaction,
                rt: s.reaction_times || [],
              },
            });
          }
        }
      } catch { /* ignore migration errors */ }
    }
  },

  /**
   * Record a single attempt. Updates session stats locally and syncs
   * the all-time stats to the API (best-effort, no await).
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

    // Update all-time stats locally (optimistic)
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
    set({ stats: updated });

    // Persist or sync
    if (IS_DEMO) {
      localStorage.setItem(LS_STATS, JSON.stringify(updated));
    } else {
      api.patch('/stats/attempt', { correct, reactionTimeMs }).catch(() => {});
    }
  },
}));
