import { STEP_TO_SEMITONE, typeToVfDuration, durationToBeats } from './noteUtils.js';

/**
 * @typedef {{ midi: number[], duration: string, isRest: boolean, staff: 'treble'|'bass', beatPos: number }} NoteEvent
 * @typedef {{ trebleIdx: number|null, bassIdx: number|null, allMidi: number[] }} Column
 * @typedef {{ treble: NoteEvent[], bass: NoteEvent[], columns: Column[] }} MeasureData
 * @typedef {{ title: string, timeSignature: string, tempo: number,
 *             events: NoteEvent[], measures: MeasureData[], hasBothStaves: boolean,
 *             columns: Column[], measureColStarts: number[] }} ParsedMusic
 */

/**
 * Given aligned treble + bass event arrays (with beatPos set), produce a list of
 * beat-aligned columns. Each column groups notes that should be played simultaneously.
 * @param {NoteEvent[]} treble
 * @param {NoteEvent[]} bass
 * @returns {Column[]}
 */
function createColumns(treble, bass) {
  // Collect all unique beat positions across both hands
  const posSet = new Set([
    ...treble.map(e => e.beatPos),
    ...bass.map(e => e.beatPos),
  ]);
  const positions = [...posSet].sort((a, b) => a - b);

  return positions.map(pos => {
    const ti = treble.findIndex(e => Math.abs(e.beatPos - pos) < 0.001);
    const bi = bass.findIndex(e => Math.abs(e.beatPos - pos) < 0.001);
    const trebleMidi = ti >= 0 ? treble[ti].midi : [];
    const bassMidi   = bi >= 0 ? bass[bi].midi   : [];
    // Deduplicate across hands (e.g. unison notes)
    const allMidi = [...new Set([...trebleMidi, ...bassMidi])];
    return { trebleIdx: ti >= 0 ? ti : null, bassIdx: bi >= 0 ? bi : null, allMidi };
  });
}

/**
 * Parse a single <part> element into per-measure event arrays.
 * Each event gets a beatPos (beats from measure start) and staff tag.
 */
function parsePartToMeasures(partEl) {
  let timeBeats = 4, timeBeatType = 4;
  const measures = [];

  for (const measureEl of partEl.querySelectorAll('measure')) {
    const beatsEl = measureEl.querySelector('time > beats');
    if (beatsEl) timeBeats = parseInt(beatsEl.textContent) || 4;
    const beatTypeEl = measureEl.querySelector('time > beat-type');
    if (beatTypeEl) timeBeatType = parseInt(beatTypeEl.textContent) || 4;

    const events = [];
    // Track beat position per staff within the measure
    const beatCursor = { treble: 0, bass: 0 };

    for (const noteEl of measureEl.querySelectorAll('note')) {
      const isTiedStop = Array.from(noteEl.querySelectorAll('tie')).some(
        t => t.getAttribute('type') === 'stop'
      );
      if (isTiedStop) continue;

      const isChord    = !!noteEl.querySelector('chord');
      const isRest     = !!noteEl.querySelector('rest');
      const vfDuration = typeToVfDuration(noteEl.querySelector('type')?.textContent ?? 'quarter');
      const staffNum   = parseInt(noteEl.querySelector('staff')?.textContent ?? '1');
      const staff      = staffNum === 2 ? 'bass' : 'treble';

      // Chord notes don't advance the beat cursor
      const beatPos = isChord && events.length > 0 && !events.at(-1).isRest
        ? events.at(-1).beatPos
        : beatCursor[staff];

      if (isRest) {
        if (!isChord) {
          beatCursor[staff] += durationToBeats(vfDuration);
          events.push({ midi: [], duration: vfDuration, isRest: true, staff, beatPos });
        }
        continue;
      }

      const pitch = noteEl.querySelector('pitch');
      if (!pitch) continue;
      const step = pitch.querySelector('step')?.textContent ?? '';
      if (!(step in STEP_TO_SEMITONE)) continue;

      const octave = parseInt(pitch.querySelector('octave')?.textContent ?? '4');
      const alter  = parseFloat(pitch.querySelector('alter')?.textContent ?? '0');
      const midi   = 12 + octave * 12 + STEP_TO_SEMITONE[step] + Math.round(alter);

      if (isChord && events.length > 0 && !events.at(-1).isRest) {
        events.at(-1).midi.push(midi);
        events.at(-1).midi.sort((a, b) => a - b);
      } else {
        events.push({ midi: [midi], duration: vfDuration, isRest: false, staff, beatPos });
        beatCursor[staff] += durationToBeats(vfDuration);
      }
    }
    measures.push({ events, timeBeats, timeBeatType });
  }

  return { measures, timeBeats, timeBeatType };
}

/**
 * Parse a MusicXML string. Supports two-part scores (part 1 = treble, part 2 = bass)
 * and single-part scores with <staff> elements. Returns beat-aligned columns per measure.
 * @param {string} xmlString
 * @returns {ParsedMusic | null}
 */
export function parseMusicXML(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  if (doc.querySelector('parseerror')) return null;

  const parts = Array.from(doc.querySelectorAll('part'));
  if (!parts.length) return null;

  let trebleMeasureEvents, bassMeasureEvents, timeBeats, timeBeatType;

  if (parts.length >= 2) {
    const p1 = parsePartToMeasures(parts[0]);
    const p2 = parsePartToMeasures(parts[1]);
    timeBeats    = p1.timeBeats;
    timeBeatType = p1.timeBeatType;
    trebleMeasureEvents = p1.measures.map(m =>
      m.events.filter(e => !e.isRest && e.midi.length > 0).map(e => ({ ...e, staff: 'treble' }))
    );
    bassMeasureEvents = p2.measures.map(m =>
      m.events.filter(e => !e.isRest && e.midi.length > 0).map(e => ({ ...e, staff: 'bass' }))
    );
  } else {
    const p1 = parsePartToMeasures(parts[0]);
    timeBeats    = p1.timeBeats;
    timeBeatType = p1.timeBeatType;
    trebleMeasureEvents = p1.measures.map(m =>
      m.events.filter(e => !e.isRest && e.midi.length > 0 && e.staff === 'treble')
    );
    bassMeasureEvents = p1.measures.map(m =>
      m.events.filter(e => !e.isRest && e.midi.length > 0 && e.staff === 'bass')
    );
  }

  const numMeasures = Math.max(trebleMeasureEvents.length, bassMeasureEvents.length);
  const measures = Array.from({ length: numMeasures }, (_, i) => {
    const treble = trebleMeasureEvents[i] ?? [];
    const bass   = bassMeasureEvents[i]   ?? [];
    return { treble, bass, columns: createColumns(treble, bass) };
  });

  const hasBothStaves  = measures.some(m => m.bass.length > 0);
  const columns        = measures.flatMap(m => m.columns);
  const measureColStarts = buildMeasureColStarts(measures);
  const events         = measures.flatMap(m => [...m.treble, ...m.bass]);

  const title    = doc.querySelector('movement-title')?.textContent
                || doc.querySelector('work-title')?.textContent
                || 'Untitled';
  const tempoEl  = doc.querySelector('sound[tempo]');
  const tempo    = tempoEl ? parseInt(tempoEl.getAttribute('tempo')) : 80;

  return { title, timeSignature: `${timeBeats}/${timeBeatType}`, tempo, events, measures, hasBothStaves, columns, measureColStarts };
}

/**
 * Parse a MIDI file. First track = treble, second track = bass (if present).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<ParsedMusic | null>}
 */
export async function parseMidiFile(buffer) {
  try {
    const { Midi } = await import('@tonejs/midi');
    const midi = new Midi(buffer);

    const noteTracks = midi.tracks.filter(t => t.notes.length > 0).slice(0, 2);
    if (!noteTracks.length) return null;

    const bpm             = midi.header.tempos[0]?.bpm ?? 80;
    const ts              = midi.header.timeSignatures[0];
    const timeSignature   = ts ? `${ts.timeSignature[0]}/${ts.timeSignature[1]}` : '4/4';
    const beatsPerMeasure = parseInt(timeSignature.split('/')[0]) || 4;
    const ppq             = midi.header.ppq;

    function trackToMeasureEvents(track, staff) {
      const sorted = [...track.notes].sort((a, b) => a.ticks - b.ticks);
      const measureMap = new Map();

      for (const note of sorted) {
        const measureIdx      = Math.floor(note.ticks / (beatsPerMeasure * ppq));
        const measureStartTick = measureIdx * beatsPerMeasure * ppq;
        const beatPos         = (note.ticks - measureStartTick) / ppq;

        if (!measureMap.has(measureIdx)) measureMap.set(measureIdx, []);
        const events = measureMap.get(measureIdx);

        const last     = events.at(-1);
        const timeDiff = last ? Math.abs(note.time - last._time) : Infinity;
        if (last && timeDiff < 0.03) {
          last.midi.push(note.midi);
          last.midi.sort((a, b) => a - b);
        } else {
          const dur =
            note.duration >= 1.8  ? 'w' :
            note.duration >= 0.9  ? 'h' :
            note.duration >= 0.45 ? 'q' : '8';
          events.push({ midi: [note.midi], duration: dur, isRest: false, staff, beatPos, _time: note.time });
        }
      }

      const maxMeasure = measureMap.size > 0 ? Math.max(...measureMap.keys()) : 0;
      return Array.from({ length: maxMeasure + 1 }, (_, i) =>
        (measureMap.get(i) ?? []).map(({ _time, ...e }) => e)
      );
    }

    const trebleMeasures = trackToMeasureEvents(noteTracks[0], 'treble');
    const bassMeasures   = noteTracks[1] ? trackToMeasureEvents(noteTracks[1], 'bass') : [];

    const numMeasures = Math.max(trebleMeasures.length, bassMeasures.length);
    const measures = Array.from({ length: numMeasures }, (_, i) => {
      const treble = trebleMeasures[i] ?? [];
      const bass   = bassMeasures[i]   ?? [];
      return { treble, bass, columns: createColumns(treble, bass) };
    });

    const hasBothStaves  = measures.some(m => m.bass.length > 0);
    const columns        = measures.flatMap(m => m.columns);
    const measureColStarts = buildMeasureColStarts(measures);
    const events         = measures.flatMap(m => [...m.treble, ...m.bass]);

    return {
      title: midi.header.name || 'MIDI Import',
      timeSignature,
      tempo: Math.round(bpm),
      events,
      measures,
      hasBothStaves,
      columns,
      measureColStarts,
    };
  } catch (err) {
    console.error('MIDI parse error:', err);
    return null;
  }
}

/** Compute prefix sums: measureColStarts[i] = index of measure i's first column in the flat columns array. */
function buildMeasureColStarts(measures) {
  const starts = [];
  let idx = 0;
  for (const m of measures) {
    starts.push(idx);
    idx += m.columns.length;
  }
  return starts;
}

/**
 * Group a flat NoteEvent list into measure-sized pages.
 * Kept for backward compatibility.
 */
export function groupIntoPages(events, timeSignature) {
  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]) || 4;
  const pages = [];
  let page    = [];
  let beats   = 0;

  for (const event of events) {
    page.push(event);
    beats += durationToBeats(event.duration);
    if (beats >= beatsPerMeasure - 0.01) {
      pages.push(page);
      page  = [];
      beats = 0;
    }
  }
  if (page.length > 0) pages.push(page);
  return pages;
}
