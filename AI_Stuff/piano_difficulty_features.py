#!/usr/bin/env python3
"""
Piano Difficulty Feature Extractor
===================================
Extracts 30 objective, computable features from MusicXML or MIDI files
for use in a piano difficulty ranking model.

Usage:
    python piano_difficulty_features.py <input_file> [--output json|csv|both] [--pretty]

Supports: .xml, .mxl, .musicxml, .mid, .midi
"""

import argparse
import json
import csv
import sys
import os
import warnings
from collections import defaultdict
from fractions import Fraction
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

from music21 import (
    converter, tempo, meter, key, note, chord, stream,
    articulations, expressions, interval, pitch
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_tempo_bpm(score):
    """Extract the first MetronomeMark BPM, default 120."""
    for el in score.recurse():
        if isinstance(el, tempo.MetronomeMark):
            if el.number is not None:
                return float(el.number)
    return 120.0


def quarter_length_to_seconds(ql, bpm):
    """Convert quarter-note length to seconds at given BPM."""
    if bpm <= 0:
        bpm = 120.0
    return (ql * 60.0) / bpm


def get_hands(score):
    """
    Split score into right hand and left hand parts.
    Convention: first part = RH, second part = LH.
    Returns (rh_part, lh_part) — either may be None.
    """
    parts = list(score.parts)
    rh = parts[0] if len(parts) >= 1 else None
    lh = parts[1] if len(parts) >= 2 else None
    return rh, lh


def extract_notes_and_chords(part):
    """Yield (offset_ql, duration_ql, [midi_pitches]) for every note/chord."""
    if part is None:
        return
    for el in part.recurse().notesAndRests:
        if isinstance(el, note.Rest):
            continue
        off = float(el.getOffsetInHierarchy(part))
        dur = float(el.quarterLength)
        if isinstance(el, chord.Chord):
            pitches = sorted([p.midi for p in el.pitches])
        elif isinstance(el, note.Note):
            pitches = [el.pitch.midi]
        else:
            continue
        yield off, dur, pitches


def extract_all_events(part):
    """Yield (offset_ql, duration_ql, element) for notes, chords AND rests."""
    if part is None:
        return
    for el in part.recurse().notesAndRests:
        off = float(el.getOffsetInHierarchy(part))
        dur = float(el.quarterLength)
        yield off, dur, el


def notes_list(part):
    """Return list of (offset_sec, dur_sec, [midis]) sorted by offset."""
    return sorted(extract_notes_and_chords(part), key=lambda x: x[0])


# ---------------------------------------------------------------------------
# Feature extraction functions
# ---------------------------------------------------------------------------

def compute_note_density_features(all_events_sec, total_duration_sec):
    """Features 1-4, 6: note density and speed metrics."""
    results = {}

    if not all_events_sec or total_duration_sec <= 0:
        return {
            "01_avg_notes_per_sec": 0, "02_p95_notes_per_sec": 0,
            "03_max_notes_1sec_window": 0, "04_shortest_note_dur_sec": 0,
            "06_notes_per_minute": 0,
        }

    onsets = sorted([t for t, _, _ in all_events_sec])
    total_notes = len(onsets)

    # F1: Average notes per second
    results["01_avg_notes_per_sec"] = total_notes / total_duration_sec

    # F6: Total note count per minute
    results["06_notes_per_minute"] = total_notes / (total_duration_sec / 60.0)

    # Windowed note counts (1-second sliding window, 0.1s step)
    if onsets:
        window_counts = []
        t = 0.0
        while t <= total_duration_sec:
            count = sum(1 for o in onsets if t <= o < t + 1.0)
            window_counts.append(count)
            t += 0.1

        # F2: 95th percentile notes per second
        results["02_p95_notes_per_sec"] = float(np.percentile(window_counts, 95))

        # F3: Max notes in any 1-second window
        results["03_max_notes_1sec_window"] = max(window_counts)
    else:
        results["02_p95_notes_per_sec"] = 0
        results["03_max_notes_1sec_window"] = 0

    # F4: Shortest note duration in seconds
    durations = [d for _, d, _ in all_events_sec if d > 0]
    results["04_shortest_note_dur_sec"] = min(durations) if durations else 0

    return results


def compute_rest_ratio(rh, lh, bpm):
    """F5: Rest-to-note ratio."""
    total_rest_dur = 0.0
    total_note_dur = 0.0

    for part in [rh, lh]:
        if part is None:
            continue
        for el in part.recurse().notesAndRests:
            dur_sec = quarter_length_to_seconds(float(el.quarterLength), bpm)
            if isinstance(el, note.Rest):
                total_rest_dur += dur_sec
            else:
                total_note_dur += dur_sec

    if total_note_dur == 0:
        return 0.0
    return total_rest_dur / total_note_dur


def compute_chord_features(rh_notes, lh_notes):
    """Features 7-11: chord size, span, cluster density."""
    results = {}

    for label, events in [("rh", rh_notes), ("lh", lh_notes)]:
        max_sim = 0
        sim_counts = []
        max_span = 0
        chords_gt_octave = 0
        total_chords = 0
        cluster_seconds = 0
        total_chord_notes = 0

        for _, _, pitches in events:
            n = len(pitches)
            sim_counts.append(n)
            if n > max_sim:
                max_sim = n
            if n >= 2:
                total_chords += 1
                span = pitches[-1] - pitches[0]
                if span > max_span:
                    max_span = span
                if span > 12:
                    chords_gt_octave += 1
                # Cluster: count minor/major 2nd intervals within chord
                for i in range(len(pitches) - 1):
                    ivl = pitches[i + 1] - pitches[i]
                    if ivl <= 2:
                        cluster_seconds += 1
                total_chord_notes += n

        results[f"07_max_simultaneous_{label}"] = max_sim
        results[f"08_avg_simultaneous_{label}"] = (
            float(np.mean(sim_counts)) if sim_counts else 0
        )
        results[f"09_max_chord_span_st_{label}"] = max_span

    # Aggregate across hands for 10, 11
    all_events = rh_notes + lh_notes
    total_chords = 0
    chords_gt_octave = 0
    cluster_count = 0
    total_chord_intervals = 0

    for _, _, pitches in all_events:
        if len(pitches) >= 2:
            total_chords += 1
            span = pitches[-1] - pitches[0]
            if span > 12:
                chords_gt_octave += 1
            for i in range(len(pitches) - 1):
                ivl = pitches[i + 1] - pitches[i]
                total_chord_intervals += 1
                if ivl <= 2:
                    cluster_count += 1

    results["10_pct_chords_gt_octave"] = (
        (chords_gt_octave / total_chords * 100) if total_chords > 0 else 0
    )
    results["11_cluster_density"] = (
        (cluster_count / total_chord_intervals) if total_chord_intervals > 0 else 0
    )

    return results


def compute_melodic_features(rh_notes, lh_notes):
    """Features 12-15: melodic intervals and hand displacement."""
    results = {}

    for label, events in [("rh", rh_notes), ("lh", lh_notes)]:
        intervals = []
        if len(events) >= 2:
            for i in range(1, len(events)):
                prev_top = events[i - 1][2][-1]  # top note of previous
                curr_top = events[i][2][-1] if label == "rh" else events[i][2][0]
                prev_p = events[i - 1][2][-1] if label == "rh" else events[i - 1][2][0]
                ivl = abs(curr_top - prev_p)
                intervals.append(ivl)

        results[f"12_avg_melodic_interval_{label}"] = (
            float(np.mean(intervals)) if intervals else 0
        )
        results[f"13_max_melodic_leap_{label}"] = max(intervals) if intervals else 0
        results[f"14_pct_intervals_gt_octave_{label}"] = (
            (sum(1 for i in intervals if i > 12) / len(intervals) * 100)
            if intervals else 0
        )

    return results


def compute_hand_displacement(rh_notes, lh_notes, bpm):
    """F15: Average hand displacement per 2-second window."""
    displacements = []

    for events in [rh_notes, lh_notes]:
        if not events:
            continue

        # Convert to seconds and get center pitch
        sec_events = []
        for off_ql, dur_ql, pitches in events:
            t = quarter_length_to_seconds(off_ql, bpm)
            center = np.mean(pitches)
            sec_events.append((t, center))

        if len(sec_events) < 2:
            continue

        max_t = sec_events[-1][0]
        t = 0.0
        while t <= max_t:
            window = [p for time, p in sec_events if t <= time < t + 2.0]
            if len(window) >= 2:
                disp = max(window) - min(window)
                displacements.append(disp)
            t += 1.0

    return float(np.mean(displacements)) if displacements else 0.0


def compute_hand_crossing(rh_notes, lh_notes):
    """F16: Number of hand crossing events."""
    if not rh_notes or not lh_notes:
        return 0

    # Build time-indexed pitch maps
    rh_by_time = {round(off, 4): pitches for off, _, pitches in rh_notes}
    lh_by_time = {round(off, 4): pitches for off, _, pitches in lh_notes}

    crossings = 0
    common_times = set(rh_by_time.keys()) & set(lh_by_time.keys())

    for t in common_times:
        rh_lowest = min(rh_by_time[t])
        lh_highest = max(lh_by_time[t])
        if lh_highest > rh_lowest:
            crossings += 1

    # Also check near-simultaneous events (within 0.05 ql)
    rh_times = sorted(rh_by_time.keys())
    lh_times = sorted(lh_by_time.keys())

    for rt in rh_times:
        if rt in common_times:
            continue
        for lt in lh_times:
            if abs(rt - lt) < 0.05 and lt not in common_times:
                rh_lowest = min(rh_by_time[rt])
                lh_highest = max(lh_by_time[lt])
                if lh_highest > rh_lowest:
                    crossings += 1
                break

    return crossings


def compute_voice_features(rh, lh, score):
    """Features 17-18: voice count statistics."""
    measure_voice_counts = []

    for part in [rh, lh]:
        if part is None:
            continue
        for m in part.getElementsByClass(stream.Measure):
            voices = m.voices
            if voices:
                measure_voice_counts.append(len(voices))
            else:
                # Check if there's content
                has_notes = any(
                    isinstance(el, (note.Note, chord.Chord))
                    for el in m.recurse().notesAndRests
                    if not isinstance(el, note.Rest)
                )
                if has_notes:
                    measure_voice_counts.append(1)

    avg_voices = float(np.mean(measure_voice_counts)) if measure_voice_counts else 1.0
    pct_3plus = (
        (sum(1 for v in measure_voice_counts if v >= 3) / len(measure_voice_counts) * 100)
        if measure_voice_counts else 0
    )

    return avg_voices, pct_3plus


def compute_rhythmic_correlation(rh_notes, lh_notes, bpm, total_dur_sec):
    """F19: Inter-hand rhythmic correlation."""
    if not rh_notes or not lh_notes or total_dur_sec <= 0:
        return 0.0

    # Quantize onsets into 50ms bins
    bin_size = 0.05
    n_bins = int(total_dur_sec / bin_size) + 1

    rh_bins = np.zeros(n_bins)
    lh_bins = np.zeros(n_bins)

    for off_ql, _, _ in rh_notes:
        t = quarter_length_to_seconds(off_ql, bpm)
        idx = min(int(t / bin_size), n_bins - 1)
        rh_bins[idx] += 1

    for off_ql, _, _ in lh_notes:
        t = quarter_length_to_seconds(off_ql, bpm)
        idx = min(int(t / bin_size), n_bins - 1)
        lh_bins[idx] += 1

    if np.std(rh_bins) == 0 or np.std(lh_bins) == 0:
        return 0.0

    corr = np.corrcoef(rh_bins, lh_bins)[0, 1]
    return float(corr) if not np.isnan(corr) else 0.0


def compute_sustained_overlap(part, bpm):
    """F20: Sustained note overlap frequency within a hand."""
    if part is None:
        return 0.0

    events = notes_list(part)
    if len(events) < 2:
        return 0.0

    overlaps = 0
    total_pairs = 0

    # Check consecutive events for temporal overlap
    active = []  # list of (end_time_ql,)
    for off, dur, pitches in events:
        end = off + dur
        # Count how many previously active notes overlap this onset
        new_active = []
        for prev_end in active:
            if prev_end > off + 0.01:  # still sounding
                overlaps += 1
            if prev_end > off:
                new_active.append(prev_end)
        new_active.append(end)
        active = new_active
        total_pairs += 1

    return overlaps / total_pairs if total_pairs > 0 else 0.0


def compute_tuplet_density(score):
    """F21: Proportion of notes that are part of tuplets."""
    total_notes = 0
    tuplet_notes = 0

    for el in score.recurse().notesAndRests:
        if isinstance(el, note.Rest):
            continue
        total_notes += 1
        # music21 stores tuplet info in the duration
        if el.duration.tuplets:
            tuplet_notes += 1

    return tuplet_notes / total_notes if total_notes > 0 else 0.0


def compute_syncopation_index(score, bpm):
    """
    F22: Syncopation index.
    Proportion of note onsets on weak beat subdivisions.
    """
    total_onsets = 0
    syncopated = 0

    for part in score.parts:
        current_ts = meter.TimeSignature("4/4")
        for m in part.getElementsByClass(stream.Measure):
            # Update time signature if present
            ts_list = m.getElementsByClass(meter.TimeSignature)
            if ts_list:
                current_ts = ts_list[0]

            beat_dur = current_ts.beatDuration.quarterLength

            for el in m.notesAndRests:
                if isinstance(el, note.Rest):
                    continue
                total_onsets += 1
                beat_offset = float(el.offset) % beat_dur if beat_dur > 0 else 0
                # Note is syncopated if it doesn't fall on a beat boundary
                # Allow small tolerance for floating point
                if beat_offset > 0.05 and abs(beat_offset - beat_dur) > 0.05:
                    syncopated += 1

    return syncopated / total_onsets if total_onsets > 0 else 0.0


def compute_polyrhythm_count(rh, lh):
    """
    F23: Count of measures where hands have different subdivisions
    (e.g., triplets vs duplets simultaneously).
    """
    if rh is None or lh is None:
        return 0

    rh_measures = list(rh.getElementsByClass(stream.Measure))
    lh_measures = list(lh.getElementsByClass(stream.Measure))

    polyrhythm_count = 0
    n = min(len(rh_measures), len(lh_measures))

    for i in range(n):
        rh_tuplets = set()
        lh_tuplets = set()

        for el in rh_measures[i].recurse().notesAndRests:
            if isinstance(el, note.Rest):
                continue
            if el.duration.tuplets:
                for t in el.duration.tuplets:
                    rh_tuplets.add(t.numberNotesActual)

        for el in lh_measures[i].recurse().notesAndRests:
            if isinstance(el, note.Rest):
                continue
            if el.duration.tuplets:
                for t in el.duration.tuplets:
                    lh_tuplets.add(t.numberNotesActual)

        # Polyrhythm: both hands have tuplets but different subdivisions,
        # OR one hand has tuplets and the other doesn't (cross-rhythm)
        if rh_tuplets and lh_tuplets and rh_tuplets != lh_tuplets:
            polyrhythm_count += 1
        elif (rh_tuplets and not lh_tuplets and
              any(t != 2 for t in rh_tuplets)):
            polyrhythm_count += 1
        elif (lh_tuplets and not rh_tuplets and
              any(t != 2 for t in lh_tuplets)):
            polyrhythm_count += 1

    return polyrhythm_count


def compute_rhythmic_variety(score):
    """F24: Average number of distinct rhythmic values per measure."""
    measure_varieties = []

    for part in score.parts:
        for m in part.getElementsByClass(stream.Measure):
            durations = set()
            for el in m.notesAndRests:
                if isinstance(el, note.Rest):
                    continue
                durations.add(round(float(el.quarterLength), 4))
            if durations:
                measure_varieties.append(len(durations))

    return float(np.mean(measure_varieties)) if measure_varieties else 0.0


def compute_time_sig_changes(score):
    """F25: Number of time signature changes."""
    time_sigs = []
    for el in score.recurse():
        if isinstance(el, meter.TimeSignature):
            sig = el.ratioString
            if not time_sigs or time_sigs[-1] != sig:
                time_sigs.append(sig)

    return max(0, len(time_sigs) - 1)


def compute_accidental_density(score):
    """F26: Non-key-signature accidentals per note."""
    total_notes = 0
    accidental_notes = 0

    for part in score.parts:
        current_key = key.Key("C")
        for m in part.getElementsByClass(stream.Measure):
            # Update key if present
            ks_list = m.getElementsByClass(key.KeySignature)
            if ks_list:
                try:
                    current_key = ks_list[0].asKey()
                except Exception:
                    pass

            key_pitches = set()
            try:
                sc = current_key.getScale()
                for p in sc.getPitches():
                    key_pitches.add(p.pitchClass)
            except Exception:
                # Default to C major pitch classes
                key_pitches = {0, 2, 4, 5, 7, 9, 11}

            for el in m.notesAndRests:
                if isinstance(el, note.Rest):
                    continue
                pitches = []
                if isinstance(el, chord.Chord):
                    pitches = list(el.pitches)
                elif isinstance(el, note.Note):
                    pitches = [el.pitch]

                for p in pitches:
                    total_notes += 1
                    if p.pitchClass not in key_pitches:
                        accidental_notes += 1

    return accidental_notes / total_notes if total_notes > 0 else 0.0


def compute_key_features(score):
    """F27-28: Key signature complexity and modulation count."""
    key_sigs = []
    max_sharps_flats = 0

    for el in score.recurse():
        if isinstance(el, key.KeySignature):
            sf = abs(el.sharps)
            if sf > max_sharps_flats:
                max_sharps_flats = sf
            sig_id = el.sharps
            if not key_sigs or key_sigs[-1] != sig_id:
                key_sigs.append(sig_id)
        elif isinstance(el, key.Key):
            sf = abs(el.sharps)
            if sf > max_sharps_flats:
                max_sharps_flats = sf
            sig_id = el.sharps
            if not key_sigs or key_sigs[-1] != sig_id:
                key_sigs.append(sig_id)

    modulations = max(0, len(key_sigs) - 1)
    return max_sharps_flats, modulations


def compute_repeated_note_density(rh_notes, lh_notes):
    """F29: Proportion of consecutive same-pitch notes."""
    total = 0
    repeated = 0

    for events in [rh_notes, lh_notes]:
        if len(events) < 2:
            continue
        for i in range(1, len(events)):
            total += 1
            prev_pitches = events[i - 1][2]
            curr_pitches = events[i][2]
            # Check if any pitch is repeated
            if set(prev_pitches) & set(curr_pitches):
                repeated += 1

    return repeated / total if total > 0 else 0.0


def compute_ornament_density(score):
    """F30: Ornament count (trills, grace notes, tremolos, arpeggiations) per note."""
    total_notes = 0
    ornament_count = 0

    for el in score.recurse().notesAndRests:
        if isinstance(el, note.Rest):
            continue
        total_notes += 1

        # Check expressions (trills, mordents, turns, etc.)
        for expr in el.expressions:
            if isinstance(expr, (
                expressions.Trill, expressions.Mordent,
                expressions.InvertedMordent, expressions.Turn,
                expressions.InvertedTurn, expressions.Tremolo,
                expressions.Shake,
            )):
                ornament_count += 1

        # Check for grace notes
        if el.duration.isGrace:
            ornament_count += 1

        # Check articulations for arpeggiation markers
        for art in el.articulations:
            classname = type(art).__name__.lower()
            if "arpegg" in classname:
                ornament_count += 1

    # Also count grace notes that appear as separate elements
    for el in score.recurse():
        if isinstance(el, note.Note) and el.duration.isGrace:
            # Already counted above if it was in notesAndRests
            pass

    return ornament_count / total_notes if total_notes > 0 else 0.0


# ---------------------------------------------------------------------------
# Main extraction pipeline
# ---------------------------------------------------------------------------

def extract_features(filepath):
    """Extract all 30 features from a MusicXML or MIDI file."""

    print(f"Parsing {filepath}...", file=sys.stderr)
    score = converter.parse(filepath)

    bpm = get_tempo_bpm(score)
    rh, lh = get_hands(score)

    # Get note events per hand (in quarter-note offsets)
    rh_notes = notes_list(rh) if rh else []
    lh_notes = notes_list(lh) if lh else []
    all_notes = sorted(rh_notes + lh_notes, key=lambda x: x[0])

    # Convert to seconds for density features
    all_notes_sec = [
        (quarter_length_to_seconds(off, bpm),
         quarter_length_to_seconds(dur, bpm),
         pitches)
        for off, dur, pitches in all_notes
    ]

    # Estimate total duration in seconds
    total_dur_ql = float(score.highestTime) if score.highestTime else 0
    total_dur_sec = quarter_length_to_seconds(total_dur_ql, bpm)

    features = {}

    # === F1-4, F6: Note density ===
    density = compute_note_density_features(all_notes_sec, total_dur_sec)
    features.update(density)

    # === F5: Rest-to-note ratio ===
    features["05_rest_to_note_ratio"] = round(compute_rest_ratio(rh, lh, bpm), 4)

    # === F7-11: Chord features ===
    chord_feats = compute_chord_features(rh_notes, lh_notes)
    features.update(chord_feats)

    # === F12-14: Melodic features ===
    melodic_feats = compute_melodic_features(rh_notes, lh_notes)
    features.update(melodic_feats)

    # === F15: Hand displacement ===
    features["15_avg_hand_displacement_2sec"] = round(
        compute_hand_displacement(rh_notes, lh_notes, bpm), 4
    )

    # === F16: Hand crossing ===
    features["16_hand_crossing_count"] = compute_hand_crossing(rh_notes, lh_notes)

    # === F17-18: Voice features ===
    avg_v, pct_3v = compute_voice_features(rh, lh, score)
    features["17_avg_voice_count"] = round(avg_v, 4)
    features["18_pct_measures_3plus_voices"] = round(pct_3v, 2)

    # === F19: Inter-hand rhythmic correlation ===
    features["19_inter_hand_rhythmic_corr"] = round(
        compute_rhythmic_correlation(rh_notes, lh_notes, bpm, total_dur_sec), 4
    )

    # === F20: Sustained note overlap ===
    rh_overlap = compute_sustained_overlap(rh, bpm)
    lh_overlap = compute_sustained_overlap(lh, bpm)
    features["20_sustained_overlap_freq"] = round(
        (rh_overlap + lh_overlap) / 2, 4
    )

    # === F21: Tuplet density ===
    features["21_tuplet_density"] = round(compute_tuplet_density(score), 4)

    # === F22: Syncopation index ===
    features["22_syncopation_index"] = round(
        compute_syncopation_index(score, bpm), 4
    )

    # === F23: Polyrhythm count ===
    features["23_polyrhythm_count"] = compute_polyrhythm_count(rh, lh)

    # === F24: Distinct rhythmic values per measure ===
    features["24_distinct_rhythm_vals_per_measure"] = round(
        compute_rhythmic_variety(score), 4
    )

    # === F25: Time signature changes ===
    features["25_time_sig_change_count"] = compute_time_sig_changes(score)

    # === F26: Accidental density ===
    features["26_accidental_density"] = round(
        compute_accidental_density(score), 4
    )

    # === F27-28: Key features ===
    sf_count, modulations = compute_key_features(score)
    features["27_key_sig_sharps_flats"] = sf_count
    features["28_key_change_count"] = modulations

    # === F29: Repeated note density ===
    features["29_repeated_note_density"] = round(
        compute_repeated_note_density(rh_notes, lh_notes), 4
    )

    # === F30: Ornament density ===
    features["30_ornament_density"] = round(
        compute_ornament_density(score), 4
    )

    # Round all float values
    for k, v in features.items():
        if isinstance(v, float):
            features[k] = round(v, 4)

    # Add metadata
    metadata = {
        "_meta_tempo_bpm": bpm,
        "_meta_total_duration_sec": round(total_dur_sec, 2),
        "_meta_total_notes": len(all_notes),
        "_meta_file": os.path.basename(filepath),
    }

    return features, metadata


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Extract piano difficulty features from MusicXML or MIDI"
    )
    parser.add_argument("input", help="Path to .xml, .mxl, .musicxml, .mid, or .midi file")
    parser.add_argument(
        "--output", choices=["json", "csv", "both"], default="json",
        help="Output format (default: json)"
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    parser.add_argument("--out-dir", default=".", help="Output directory")

    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    features, metadata = extract_features(args.input)

    stem = Path(args.input).stem
    os.makedirs(args.out_dir, exist_ok=True)

    # Print summary table
    print("\n" + "=" * 60)
    print(f"  PIANO DIFFICULTY FEATURES: {metadata['_meta_file']}")
    print(f"  Tempo: {metadata['_meta_tempo_bpm']} BPM | "
          f"Duration: {metadata['_meta_total_duration_sec']}s | "
          f"Notes: {metadata['_meta_total_notes']}")
    print("=" * 60)

    LABELS = {
        "01": "Avg notes/sec",
        "02": "95th pctl notes/sec",
        "03": "Max notes in 1sec window",
        "04": "Shortest note dur (sec)",
        "05": "Rest-to-note ratio",
        "06": "Notes per minute",
        "07": "Max simultaneous notes",
        "08": "Avg simultaneous notes",
        "09": "Max chord span (st)",
        "10": "% chords > octave",
        "11": "Cluster density",
        "12": "Avg melodic interval",
        "13": "Max melodic leap",
        "14": "% intervals > octave",
        "15": "Hand displacement / 2sec",
        "16": "Hand crossing count",
        "17": "Avg voice count",
        "18": "% measures w/ 3+ voices",
        "19": "Inter-hand rhythm corr",
        "20": "Sustained overlap freq",
        "21": "Tuplet density",
        "22": "Syncopation index",
        "23": "Polyrhythm count",
        "24": "Distinct rhythms / measure",
        "25": "Time sig change count",
        "26": "Accidental density",
        "27": "Key sig sharps/flats",
        "28": "Key change count",
        "29": "Repeated note density",
        "30": "Ornament density",
    }

    for key_name, value in sorted(features.items()):
        num = key_name[:2]
        label = LABELS.get(num, key_name)
        suffix = ""
        if "_rh" in key_name:
            suffix = " [RH]"
        elif "_lh" in key_name:
            suffix = " [LH]"
        print(f"  {num}. {label}{suffix:>6s}  {value:>12}")
    print("=" * 60)

    # Save outputs
    combined = {**metadata, **features}

    if args.output in ("json", "both"):
        json_path = os.path.join(args.out_dir, f"{stem}_features.json")
        with open(json_path, "w") as f:
            json.dump(combined, f, indent=2 if args.pretty else None)
        print(f"\nJSON saved: {json_path}", file=sys.stderr)

    if args.output in ("csv", "both"):
        csv_path = os.path.join(args.out_dir, f"{stem}_features.csv")
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=sorted(combined.keys()))
            writer.writeheader()
            writer.writerow(combined)
        print(f"CSV saved:  {csv_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
