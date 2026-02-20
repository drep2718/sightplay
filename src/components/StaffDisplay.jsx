import React, { useEffect, useRef } from 'react';
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  StaveConnector,
} from 'vexflow';
import { getVexNoteInfo } from '../utils/noteUtils.js';

const FEEDBACK_COLORS = new Set(['#4ade80', '#f87171']);

/**
 * Post-process the VexFlow SVG output:
 *  1. Apply dark theme (convert black → theme grays)
 *  2. Cascade feedback colors set on <g> groups into their children
 *  3. Scale to fill container via viewBox
 */
function styleSvg(svg, vfW, vfH) {
  svg.setAttribute('fill', '#e8e4df');

  // Step 1 – dark theme pass
  svg.querySelectorAll('path,line,rect,text').forEach(el => {
    const stroke = el.getAttribute('stroke');
    const fill   = el.getAttribute('fill');
    const tag    = el.tagName.toLowerCase();

    if (stroke === '#000000' || stroke === 'black')
      el.setAttribute('stroke', '#3a3a4f');

    if (fill === '#000000' || fill === 'black') {
      el.setAttribute('fill', (tag === 'rect' || tag === 'line') ? '#3a3a4f' : '#e8e4df');
    } else if ((fill == null || fill === '') && tag === 'path') {
      el.setAttribute('fill', '#e8e4df');
    }
  });

  // Step 2 – cascade feedback colors from <g> parents into children
  svg.querySelectorAll('g').forEach(group => {
    const candidates = [
      group.getAttribute('fill'),
      group.getAttribute('stroke'),
      group.style.fill,
      group.style.stroke,
    ];
    const color = candidates.find(c => c && FEEDBACK_COLORS.has(c));
    if (color) {
      group.querySelectorAll('path,line,rect').forEach(child => {
        child.setAttribute('fill', color);
        child.setAttribute('stroke', color);
      });
    }
  });

  // Step 3 – scale SVG to container
  svg.setAttribute('viewBox', `0 0 ${vfW} ${vfH}`);
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width  = '100%';
  svg.style.height = '100%';
}

/**
 * Build a VexFlow StaveNote from a list of MIDI numbers.
 * Applies feedback color if provided.
 */
function buildStaveNote({ midis, duration, clef, color }) {
  const infos = midis.map(getVexNoteInfo);
  const sn = new StaveNote({
    keys: infos.map(i => i.key),
    duration,
    clef: clef || 'treble',
  });
  infos.forEach((info, idx) => {
    if (info.accidental) sn.addModifier(new Accidental(info.accidental), idx);
  });
  if (color) sn.setStyle({ fillStyle: color, strokeStyle: color });
  return sn;
}

/**
 * @param {{
 *   notes?: number[],
 *   measureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean }>,
 *   trebleMeasureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean }>,
 *   bassMeasureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean }>,
 *   clef?: string,
 *   activeClef?: string,
 *   feedback?: 'correct'|'incorrect'|null,
 *   mode?: string,
 *   timeSignature?: string,
 *   grandStaff?: boolean,
 * }} props
 */
export default function StaffDisplay({
  notes,
  measureNotes,
  trebleMeasureNotes,
  bassMeasureNotes,
  clef,
  activeClef,
  feedback,
  mode,
  timeSignature,
  grandStaff,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = '';

    const isMeasureMode  = mode === 'measure' || mode === 'sheet';
    const isGrand        = grandStaff === true;
    const hasBothHands   = trebleMeasureNotes != null && bassMeasureNotes != null;

    // Taller when showing both hands in sheet mode
    const vfW  = isMeasureMode ? 520 : 280;
    const vfH  = isGrand ? (isMeasureMode ? 320 : 280) : 150;
    const stX  = isGrand ? 40 : 10;
    const stW  = vfW - stX - 10;
    const noteClef = activeClef || (clef === 'both' ? 'treble' : clef) || 'treble';

    try {
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(vfW, vfH);
      const ctx = renderer.getContext();

      if (isGrand) {
        const trebleStave = new Stave(stX, 10, stW);
        trebleStave.addClef('treble');
        if (isMeasureMode && timeSignature) trebleStave.addTimeSignature(timeSignature);
        trebleStave.setContext(ctx).draw();

        const bassStave = new Stave(stX, 160, stW);
        bassStave.addClef('bass');
        if (isMeasureMode && timeSignature) bassStave.addTimeSignature(timeSignature);
        bassStave.setContext(ctx).draw();

        new StaveConnector(trebleStave, bassStave)
          .setType(StaveConnector.type.BRACE).setContext(ctx).draw();
        new StaveConnector(trebleStave, bassStave)
          .setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
        new StaveConnector(trebleStave, bassStave)
          .setType(StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();

        if (hasBothHands) {
          // Render notes on respective staves
          renderNotes(ctx, trebleStave, 'treble', stW, true, trebleMeasureNotes, null, null, timeSignature);
          renderNotes(ctx, bassStave,   'bass',   stW, true, bassMeasureNotes,   null, null, timeSignature);
        } else {
          // Single hand — original behaviour
          const noteStave = noteClef === 'treble' ? trebleStave : bassStave;
          renderNotes(ctx, noteStave, noteClef, stW, isMeasureMode, measureNotes, notes, feedback, timeSignature);
        }
      } else {
        const stave = new Stave(stX, 20, stW);
        stave.addClef(noteClef);
        if (isMeasureMode && timeSignature) stave.addTimeSignature(timeSignature);
        stave.setContext(ctx).draw();
        renderNotes(ctx, stave, noteClef, stW, isMeasureMode, measureNotes, notes, feedback, timeSignature);
      }

      const svg = el.querySelector('svg');
      if (svg) styleSvg(svg, vfW, vfH);
    } catch (err) {
      console.warn('VexFlow render error:', err);
    }
  }, [notes, measureNotes, trebleMeasureNotes, bassMeasureNotes, clef, activeClef, feedback, mode, timeSignature, grandStaff]);

  return <div ref={containerRef} className="staff-container" />;
}

function renderNotes(ctx, stave, clef, staveWidth, isMeasureMode, measureNotes, notes, feedback, timeSignature) {
  const noteColor = feedback === 'correct'   ? '#4ade80'
                  : feedback === 'incorrect' ? '#f87171'
                  : '#e8e4df';

  if (isMeasureMode && measureNotes?.length) {
    const vfNotes = measureNotes.map(n => {
      const color = n.played === true  ? '#4ade80'
                  : n.played === false ? '#f87171'
                  : n.current         ? '#d4a853'
                  : '#e8e4df';
      return buildStaveNote({ midis: [n.midi], duration: n.duration, clef, color });
    });

    // Sum total ticks for Voice
    const totalTicks = measureNotes.reduce(
      (sum, n) => sum + (n.duration === 'q' ? 4096 : n.duration === '8' ? 2048 : n.duration === 'h' ? 8192 : n.duration === 'w' ? 16384 : 4096),
      0
    );
    const voice = new Voice({ num_beats: totalTicks / 4096, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(vfNotes);
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
    voice.draw(ctx, stave);
    return;
  }

  if (notes?.length) {
    const sn = buildStaveNote({ midis: notes, duration: 'q', clef, color: noteColor });
    const voice = new Voice({ num_beats: 1, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables([sn]);
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
    voice.draw(ctx, stave);
  }
}
