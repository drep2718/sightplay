import React, { useEffect, useRef } from 'react';
import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Accidental,
  Annotation,
  StaveConnector,
  Ornament,
} from 'vexflow';
import { getVexNoteInfo, midiToDisplayName } from '../utils/noteUtils.js';

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
 * Applies feedback color and ornament if provided.
 */
function buildStaveNote({ midis, duration, clef, color, ornament }) {
  const infos = midis.map(getVexNoteInfo);
  const sn = new StaveNote({
    keys: infos.map(i => i.key),
    duration,
    clef: clef || 'treble',
  });
  infos.forEach((info, idx) => {
    if (info.accidental) sn.addModifier(new Accidental(info.accidental), idx);
  });
  if (ornament) {
    const ornName = ornament === 'trill'            ? 'tr'
                  : ornament === 'turn'             ? 'turn'
                  : ornament === 'mordent'          ? 'mordent'
                  : ornament === 'inverted-mordent' ? 'mordentInverted'
                  : null;
    if (ornName) {
      try { sn.addModifier(new Ornament(ornName)); } catch { /* ignore unsupported ornaments */ }
    }
  }
  if (color) sn.setStyle({ fillStyle: color, strokeStyle: color });
  return sn;
}

/**
 * @param {{
 *   notes?: number[],
 *   measureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean, ornament?: string|null }>,
 *   trebleMeasureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean, ornament?: string|null }>,
 *   bassMeasureNotes?: Array<{ midi: number, duration: string, played?: boolean|null, current?: boolean, ornament?: string|null }>,
 *   clef?: string,
 *   activeClef?: string,
 *   feedback?: 'correct'|'incorrect'|null,
 *   mode?: string,
 *   timeSignature?: string,
 *   grandStaff?: boolean,
 *   showNoteNames?: boolean,
 *   dimTreble?: boolean,
 *   dimBass?: boolean,
 *   onNoteClick?: (colIdx: number, midis: number[], ornament: string|null) => void,
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
  showNoteNames,
  dimTreble,
  dimBass,
  onNoteClick,
}) {
  const containerRef   = useRef(null);
  // Keep the callback in a ref so changing it doesn't trigger SVG rebuild
  const onNoteClickRef = useRef(onNoteClick);
  onNoteClickRef.current = onNoteClick;

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

    let trebleHits = [], bassHits = [], singleHits = [];

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
          trebleHits = renderNotes(ctx, trebleStave, 'treble', stW, true, trebleMeasureNotes, null, null, timeSignature, showNoteNames, dimTreble);
          bassHits   = renderNotes(ctx, bassStave,   'bass',   stW, true, bassMeasureNotes,   null, null, timeSignature, showNoteNames, dimBass);
        } else {
          const noteStave = noteClef === 'treble' ? trebleStave : bassStave;
          singleHits = renderNotes(ctx, noteStave, noteClef, stW, isMeasureMode, measureNotes, notes, feedback, timeSignature, showNoteNames, false);
        }
      } else {
        const stave = new Stave(stX, 20, stW);
        stave.addClef(noteClef);
        if (isMeasureMode && timeSignature) stave.addTimeSignature(timeSignature);
        stave.setContext(ctx).draw();
        singleHits = renderNotes(ctx, stave, noteClef, stW, isMeasureMode, measureNotes, notes, feedback, timeSignature, showNoteNames, false);
      }

      const svg = el.querySelector('svg');
      if (svg) {
        styleSvg(svg, vfW, vfH);

        // Always attach listener; read callback from ref so this effect
        // doesn't need to re-run (and rebuild the SVG) when the callback changes.
        if (onNoteClickRef.current) svg.style.cursor = 'pointer';
        svg.addEventListener('click', (e) => {
          if (!onNoteClickRef.current) return;
          const rect = svg.getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * vfW;
          const svgY = ((e.clientY - rect.top) / rect.height) * vfH;

          const hits = isGrand
            ? (svgY > vfH / 2 ? bassHits : trebleHits)
            : singleHits;

          let closest = null, minDist = Infinity;
          hits.forEach(a => {
            const d = Math.abs(svgX - a.x);
            if (d < minDist) { minDist = d; closest = a; }
          });
          if (closest && minDist < 50) {
            onNoteClickRef.current(closest.colIdx, closest.midis, closest.ornament ?? null);
          }
        });
      }
    } catch (err) {
      console.warn('VexFlow render error:', err);
    }
  // onNoteClick intentionally excluded — kept in ref to avoid SVG rebuilds
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, measureNotes, trebleMeasureNotes, bassMeasureNotes, clef, activeClef, feedback, mode, timeSignature, grandStaff, showNoteNames, dimTreble, dimBass]);

  return <div ref={containerRef} className="staff-container" />;
}

function addNoteNameAnnotation(sn, midi) {
  try {
    const ann = new Annotation(midiToDisplayName(midi))
      .setFont('DM Sans', 8)
      .setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
    sn.addModifier(ann, 0);
  } catch { /* ignore annotation errors */ }
}

/**
 * Renders notes onto a stave and returns an array of hit areas for click detection.
 * @returns {{ x: number, colIdx: number, midis: number[], ornament: string|null }[]}
 */
function renderNotes(ctx, stave, clef, staveWidth, isMeasureMode, measureNotes, notes, feedback, timeSignature, showNoteNames, dim) {
  const noteColor = feedback === 'correct'   ? '#4ade80'
                  : feedback === 'incorrect' ? '#f87171'
                  : '#e8e4df';

  const applyDim = dim ? { opacity: 0.35 } : null;
  const hitAreas = [];

  if (isMeasureMode && measureNotes?.length) {
    const vfNotes = measureNotes.map((n, i) => {
      if (n.isRest) {
        const restKey = clef === 'bass' ? 'd/3' : 'b/4';
        const sn = new StaveNote({ keys: [restKey], duration: n.duration + 'r', clef });
        sn.setStyle({ fillStyle: 'transparent', strokeStyle: 'transparent' });
        return sn;
      }
      const color = n.played === true  ? '#4ade80'
                  : n.played === false ? '#f87171'
                  : n.current         ? '#d4a853'
                  : '#e8e4df';
      const midis = Array.isArray(n.midi) ? n.midi : [n.midi];
      const sn = buildStaveNote({ midis, duration: n.duration, clef, color, ornament: n.ornament ?? null });
      if (showNoteNames) addNoteNameAnnotation(sn, midis[0]);
      return sn;
    });

    const totalTicks = measureNotes.reduce(
      (sum, n) => sum + (n.duration === 'q' ? 4096 : n.duration === '8' ? 2048 : n.duration === 'h' ? 8192 : n.duration === 'w' ? 16384 : 4096),
      0
    );
    const voice = new Voice({ num_beats: totalTicks / 4096, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(vfNotes);
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);

    if (applyDim) {
      const grp = ctx.openGroup('dim-staff');
      voice.draw(ctx, stave);
      ctx.closeGroup();
      if (grp) grp.setAttribute('opacity', '0.35');
    } else {
      voice.draw(ctx, stave);
    }

    // Build hit areas after formatting (positions are set after format+draw)
    vfNotes.forEach((sn, i) => {
      if (measureNotes[i].isRest) return;
      const midis = Array.isArray(measureNotes[i].midi) ? measureNotes[i].midi : [measureNotes[i].midi];
      try {
        hitAreas.push({
          x: sn.getX(),
          colIdx: i,
          midis,
          ornament: measureNotes[i].ornament ?? null,
        });
      } catch { /* ignore */ }
    });

    return hitAreas;
  }

  if (notes?.length) {
    const sn = buildStaveNote({ midis: notes, duration: 'q', clef, color: noteColor });
    if (showNoteNames) addNoteNameAnnotation(sn, notes[0]);
    const voice = new Voice({ num_beats: 1, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables([sn]);
    new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
    voice.draw(ctx, stave);
  }

  return hitAreas;
}
