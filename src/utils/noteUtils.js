export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToDisplayName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

export function isBlackKey(midi) {
  return [1, 3, 6, 8, 10].includes(midi % 12);
}

export function countWhiteKeys(lo, hi) {
  let count = 0;
  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) count++;
  }
  return count;
}

/** Returns { key: 'c/4', accidental: '#' | null } for VexFlow */
export function getVexNoteInfo(midi) {
  const oct = Math.floor(midi / 12) - 1;
  const ni = midi % 12;
  const noteNames = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
  const accidentals = [null, '#', null, '#', null, null, '#', null, '#', null, '#', null];
  return { key: `${noteNames[ni]}/${oct}`, accidental: accidentals[ni] };
}

/** Convert VexFlow duration string to beats */
export function durationToBeats(duration) {
  const map = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25, '32': 0.125 };
  return map[duration] ?? 1;
}

/** Convert MusicXML type name to VexFlow duration string */
export function typeToVfDuration(type) {
  const map = {
    whole: 'w',
    half: 'h',
    quarter: 'q',
    eighth: '8',
    '16th': '16',
    '32nd': '32',
  };
  return map[type] ?? 'q';
}

