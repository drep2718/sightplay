import { isBlackKey } from './noteUtils.js';

export const TIERS = {
  1: { rL: 60, rH: 67, cx: 1, ac: false, ch: 1, label: '5-finger position · Quarters only' },
  2: { rL: 60, rH: 72, cx: 2, ac: false, ch: 1, label: 'Full octave · Add eighth notes' },
  3: { rL: 48, rH: 72, cx: 2, ac: false, ch: 1, label: 'Both hands · Same rhythm' },
  4: { rL: 48, rH: 79, cx: 3, ac: false, ch: 1, label: 'Extended range · Complex rhythm' },
  5: { rL: 48, rH: 84, cx: 3, ac: true,  ch: 1, label: 'Accidentals · Syncopation' },
  6: { rL: 48, rH: 79, cx: 2, ac: false, ch: 2, label: 'Dyads · Two-note chords' },
  7: { rL: 48, rH: 79, cx: 2, ac: true,  ch: 3, label: 'Triads · Three-note chords' },
  8: { rL: 48, rH: 84, cx: 3, ac: true,  ch: 4, label: 'Seventh chords · Four-note chords' },
};

const CLEF_RANGES = {
  treble: { low: 60, high: 81 },
  bass:   { low: 40, high: 60 },
  both:   { low: 40, high: 81 },
};

export function getClefRange(clef) {
  return CLEF_RANGES[clef] ?? CLEF_RANGES.treble;
}

export function getEffectiveRange(clef, tier) {
  const clefRange = getClefRange(clef === 'both' ? 'treble' : clef);
  const t = TIERS[tier];
  return { low: Math.max(clefRange.low, t.rL), high: Math.min(clefRange.high, t.rH) };
}

// Rolling history to avoid repeating the same note ≥3 times in a row
const recentNotes = [];

export function generateRandomNote(lo, hi, allowAccidentals) {
  const range = [];
  for (let m = lo; m <= hi; m++) {
    if (!allowAccidentals && isBlackKey(m)) continue;
    range.push(m);
  }
  if (!range.length) return lo;

  let note, attempts = 0;
  do {
    note = range[Math.floor(Math.random() * range.length)];
    attempts++;
  } while (
    recentNotes.length >= 2 &&
    recentNotes.at(-1) === note &&
    recentNotes.at(-2) === note &&
    attempts < 30
  );

  recentNotes.push(note);
  if (recentNotes.length > 10) recentNotes.shift();
  return note;
}

export function generateInterval(lo, hi, minSemitones, maxSemitones) {
  const lower = generateRandomNote(lo, Math.max(lo, hi - minSemitones), false);
  const size = minSemitones + Math.floor(Math.random() * (maxSemitones - minSemitones + 1));
  return [lower, Math.min(lower + size, hi)];
}

const CHORD_TEMPLATES = {
  2: [[0, 4], [0, 3], [0, 5], [0, 7]],
  3: [[0, 4, 7], [0, 3, 7], [0, 3, 6], [0, 4, 8], [0, 5, 7]],
  4: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 6, 10], [0, 3, 6, 9]],
};

export function generateChord(lo, hi, chordSize, allowAccidentals) {
  const templates = CHORD_TEMPLATES[chordSize] ?? CHORD_TEMPLATES[2];
  const maxSpan = Math.max(...templates.map(t => t.at(-1)));
  let chord, attempts = 0;

  do {
    const root = generateRandomNote(lo, Math.max(lo, hi - maxSpan), allowAccidentals);
    const template = templates[Math.floor(Math.random() * templates.length)];
    chord = template.map(interval => root + interval);
    attempts++;
  } while (chord.at(-1) > hi && attempts < 30);

  if (!allowAccidentals) {
    chord = chord.map(n => (isBlackKey(n) ? n + 1 : n));
  }
  return chord.sort((a, b) => a - b);
}

export function generateMeasure(lo, hi, beats, complexity, allowAccidentals) {
  const notes = [];
  let prev = lo + Math.floor(Math.random() * (hi - lo));
  const durPool = complexity === 1 ? ['q'] : complexity === 2 ? ['q', 'q', '8', '8'] : ['q', '8', '8'];
  let remaining = beats;

  while (remaining > 0.01) {
    let dur = durPool[Math.floor(Math.random() * durPool.length)];
    const db = dur === 'q' ? 1 : 0.5;
    if (db > remaining) dur = remaining >= 0.5 ? '8' : 'q';
    const actualBeats = dur === 'q' ? 1 : 0.5;

    const step = Math.random() < 0.65
      ? (Math.random() < 0.5 ? -2 : 2)
      : (Math.random() < 0.5 ? -4 : 4);
    let next = Math.max(lo, Math.min(hi, prev + step + Math.floor(Math.random() * 3) - 1));
    if (!allowAccidentals && isBlackKey(next)) {
      next = Math.max(lo, Math.min(hi, next + (Math.random() < 0.5 ? 1 : -1)));
    }

    notes.push({ midi: next, duration: dur });
    prev = next;
    remaining -= actualBeats;
  }
  return notes;
}
