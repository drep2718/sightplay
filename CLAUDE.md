# MicroSight - Claude Context

## What This Project Is
**MicroSight** is a full-stack music education platform — a sight-reading trainer for musicians.

## Tech Stack
- **Frontend:** React 18 + Vite, Zustand (global state), VexFlow (sheet music notation), Web MIDI API, Web Audio API
- **Backend:** Node.js + Express, PostgreSQL, Redis
- **Auth:** JWT (15-min access + 7-day refresh rotation) + Google OAuth
- **Containerized:** Docker + Docker Compose, Nginx reverse proxy
- **Music libs:** `@tonejs/midi` (MIDI file parsing), VexFlow (notation rendering)

## Running the Project
```bash
./dev.sh   # starts all services (frontend + backend + DB + Redis)
```
Or with Docker:
```bash
docker-compose up
```

## Project Structure
```
microsight/
├── src/                        # React frontend
│   ├── App.jsx                 # Main router, MIDI coordinator, keyboard input
│   ├── store/index.js          # Zustand store - all state + API sync
│   ├── hooks/
│   │   ├── useMetronome.js     # Web Audio API metronome (supports volume param)
│   │   ├── useAudioSynth.js    # Web Audio triangle-wave synth (module singleton)
│   │   ├── useMidi.js          # Web MIDI API wrapper
│   │   ├── useAuth.js          # Auth state consumer
│   │   └── useApi.js           # Axios client with JWT interceptors
│   ├── components/
│   │   ├── modes/
│   │   │   ├── FlashMode.jsx       # Single note recognition
│   │   │   ├── IntervalMode.jsx    # Two-note interval identification
│   │   │   ├── MeasureMode.jsx     # Rhythm sequences + metronome
│   │   │   └── SheetMusicMode.jsx  # MusicXML/MIDI guided practice
│   │   ├── StaffDisplay.jsx    # VexFlow sheet music renderer (showNoteNames, dimTreble/dimBass)
│   │   ├── KeyboardViz.jsx     # 88-key piano visualization (heatmapData, showAllNoteNames)
│   │   ├── PieceLibrary.jsx    # Saved-piece grid (load/favorite/delete)
│   │   ├── BeatIndicator.jsx   # Animated beat pulse display
│   │   ├── StatsPanel.jsx      # Real-time stats display
│   │   └── Sidebar.jsx         # Mode selector + settings
│   └── utils/
│       ├── generators.js       # Note/chord/interval/measure generation
│       ├── musicXmlParser.js   # MusicXML + MIDI file parsing
│       └── noteUtils.js        # MIDI/note conversion utilities
├── server/src/                 # Express backend
│   ├── app.js                  # Express app factory
│   ├── routes/                 # auth, users, stats, sessions, admin, pieces
│   ├── controllers/            # business logic per route
│   ├── services/               # shared logic (auth, stats, sessions, pieces)
│   ├── middleware/             # JWT auth, admin guard, rate limiter, validator
│   └── config/                 # DB (pg), Redis (ioredis), env vars
├── migrations/
│   ├── 001_initial_schema.sql  # Full DB schema (users, prefs, stats, sessions, tokens)
│   └── 002_pieces.sql          # pieces table (run manually: see Migrations section)
├── docker-compose.yml
├── Dockerfile
└── vite.config.js
```

## Database Schema
- **users** - auth (email/password or Google OAuth), roles (user/admin)
- **user_preferences** - mode, clef, tier (1-8), accidentals, BPM, time_sig, interval_max
- **all_time_stats** - total_attempts, total_correct, best_reaction, reaction_times (JSONB)
- **sessions** - per-session snapshots (config + results)
- **refresh_tokens** - JWT rotation with theft detection
- **pieces** - user piece library (file_content as TEXT, max 50/user, upsert by title)

## Migrations
Migrations in `./migrations/` are auto-run by Docker **only on first DB init**. For subsequent migrations run manually:
```bash
docker compose exec postgres psql -U postgres -d microsight -f /docker-entrypoint-initdb.d/002_pieces.sql
```

## Current Training Modes
1. **Flash Note Mode** - random note shown, user plays it on MIDI keyboard
2. **Interval Training** - two-note interval shown, user plays both
3. **Measure Mode** - multi-note sequence with metronome (BPM 40-180, configurable time sig)
4. **Sheet Music Mode** - upload MusicXML or MIDI file, guided note-by-note practice

## Implemented Features (as of 2026-02-23)

### Note Sound Playback (`useAudioSynth.js`)
- Module-singleton Web Audio context, triangle-wave oscillator
- `playNote(midi, velocity=0.65, duration=0.55)` — used in all three note-input modes
- Correct note → full velocity; wrong note → plays the **correct** note at 0.2 (quiet hint)

### Note Difficulty Heatmap
- `noteMissCounts: { [midi]: count }` in Zustand store
- `recordNoteMiss(correctMidi)` called whenever wrong note is pressed (tracks what they *should* have played)
- `resetHeatmap()` — clears counts
- `KeyboardViz` colors keys green→red based on miss frequency when `heatmapData` prop is set
- Sidebar shows "Clear" button when miss data exists
- App.jsx passes `noteMissCounts` to `KeyboardViz`

### Note Names Toggle
- `showNoteNames` boolean in store, toggle in Sidebar
- `StaffDisplay` adds VexFlow `Annotation` below each notehead when enabled
- `KeyboardViz` shows label on every white key (not just C + lowest) when `showAllNoteNames` is true

### Metronome Volume Control
- `metroVolume` (0–1) in store, slider in Sidebar (shown for Measure + Sheet modes)
- `useMetronome` accepts `volume` prop — scales all click gain values

### Hands Separate Practice (SheetMusicMode)
- `handMode` state: `'both' | 'rh' | 'lh'` — shown on start screen only for grand-staff pieces
- `dimTreble` / `dimBass` props on `StaffDisplay` reduce inactive staff opacity to ~35%
- `handleNoteOn` filters required notes based on active hand

### Half-Speed Slider (SheetMusicMode)
- `practiceSpeed` state: `0.25 | 0.5 | 0.75 | 1.0` — shown on start screen
- `effectiveBpm = Math.round(parsedMusic.tempo * practiceSpeed)` passed to metronome
- BPM display in metro bar shows current speed percentage when < 100%

### Piece Library
- **DB:** `pieces` table with `file_content TEXT` (XML stored as UTF-8, MIDI as base64)
- **API:** `GET/POST /api/pieces`, `GET /api/pieces/:id`, `PATCH /:id/favorite`, `PATCH /:id/played`, `DELETE /:id`
- **Limits:** 50 pieces per user, 1.5 MB per file, upsert by `(user_id, title)`
- **Body parser:** global 10 KB limit skips `/api/pieces`; route applies `express.json({ limit: '2mb' })`
- **Frontend:** `PieceLibrary.jsx` collapsible grid shown above upload dropzone in SheetMusicMode
- **Save:** "+ Save to Library" button on start screen (after file parsed); calls `POST /api/pieces`
- **Load:** fetches full content via `GET /api/pieces/:id`, re-parses in browser, increments play_count
- Store: `pieces[]`, `loadPieces()` — loaded on SheetMusicMode mount

## Audio Features
- **Metronome** (`useMetronome.js`) - Web Audio API lookahead scheduler, accent on beat 1, configurable BPM + beats-per-measure + subdivision + volume
- **Note synth** (`useAudioSynth.js`) - triangle-wave, module singleton, plays on correct/incorrect answers
- **MIDI keyboard** - Web MIDI API, auto-detect/disconnect, fallback A-K keys = C4-C5
- **VexFlow** - renders treble, bass, or grand staff with accidentals, chords, rests, optional note-name annotations

## Zustand Store Fields (src/store/index.js)
**MIDI:** midiAccess, midiInputs, selectedInput, midiStatus, pressedKeys, detectedMidiRange
**Settings:** mode, clef, tier, accidentals, showKeyboard, kbSize, bpm, timeSig, intervalMax, showNoteNames, metroVolume
**Heatmap:** noteMissCounts, recordNoteMiss(midi), resetHeatmap()
**Pieces:** pieces[], loadPieces(), setPieces()
**Session:** session {at,co,rt}, resetSession(), recordAttempt()
**All-time:** stats {ta,tc,br,rt}, loadUserData(), sessionHistory[]

## MIDI Flow
```
MIDI keyboard → useMidi hook → handleNoteOn (App.jsx) → active mode handler
→ recordAttempt() + recordNoteMiss() → local Zustand state + POST /api/stats/attempt
→ PostgreSQL (all_time_stats, sessions)
```

## Auth Flow
```
Login/Register → JWT pair issued → useApi auto-refreshes on 401
→ Stolen token? → entire token family invalidated → logout
```

## Remaining Planned Features
- Rhythm timing accuracy — already partially implemented (timing labels exist in Measure + Sheet modes)
- Progress charts — reaction time trend, accuracy over time (StatsPanel has canvas charts already)
- Daily streak & goals
- Ear Training Mode (audio-first, no visual)
- MIDI latency calibration
- Practice session timer

## Key Conventions
- Dark theme only (dark background, globals.css)
- Zustand store handles all global state; components read from store
- API calls are fire-and-forget for recording attempts (don't block UX)
- Tier system (1-8) controls difficulty (note range, chords, accidentals)
- All preferences auto-sync to backend on change (debounced 2s via Sidebar)
- New migrations must be run manually against existing DBs (Docker only auto-runs on first init)
