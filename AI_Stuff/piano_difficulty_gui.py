#!/usr/bin/env python3
"""
Piano Difficulty Feature Extractor — Pygame GUI (Batch Mode)
=============================================================
Extracts difficulty features from individual MusicXML/MIDI files
OR every music file inside a folder.

Usage:
    python piano_difficulty_gui.py
    python piano_difficulty_gui.py somefile.xml
    python piano_difficulty_gui.py /path/to/folder

Requirements:
    pip install pygame music21 numpy
"""

import os
import sys
import json
import csv
import threading
import traceback
from pathlib import Path

import pygame

# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from piano_difficulty_features import extract_features

MUSIC_EXTS = {".xml", ".mxl", ".musicxml", ".mid", ".midi"}

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
WIN_W, WIN_H = 1100, 760
FPS = 60

BG           = (18, 18, 24)
SURFACE      = (26, 26, 36)
SURFACE2     = (34, 34, 48)
SURFACE3     = (44, 44, 60)
BORDER       = (55, 55, 75)
BORDER_HI    = (80, 78, 110)
TEXT         = (232, 230, 240)
TEXT_DIM     = (138, 135, 158)
TEXT_DIMMER  = (92, 89, 114)
ACCENT       = (160, 130, 255)
GREEN        = (126, 230, 168)
GREEN_BG     = (30, 60, 42)
AMBER        = (240, 198, 116)
AMBER_BG     = (60, 50, 28)
RED          = (240, 120, 120)
RED_BG       = (60, 30, 30)
BLUE         = (120, 184, 240)
BLUE_BG      = (28, 42, 60)

CAT_COLORS = {
    "Note Density":         (BLUE,   BLUE_BG),
    "Chords & Voicing":     (GREEN,  GREEN_BG),
    "Melodic Motion":       (AMBER,  AMBER_BG),
    "Hand Coordination":    (RED,    RED_BG),
    "Rhythm & Meter":       (ACCENT, (40, 32, 58)),
    "Key & Accidentals":    (BLUE,   BLUE_BG),
    "Ornaments & Patterns": (GREEN,  GREEN_BG),
}

FEATURE_DEFS = [
    ("01_avg_notes_per_sec",            "Avg notes / sec",           "Note Density",      "{:.2f}"),
    ("02_p95_notes_per_sec",            "95th pctl notes / sec",     "Note Density",      "{:.2f}"),
    ("03_max_notes_1sec_window",        "Max notes in 1s window",    "Note Density",      "{:d}"),
    ("04_shortest_note_dur_sec",        "Shortest note dur (sec)",   "Note Density",      "{:.4f}"),
    ("05_rest_to_note_ratio",           "Rest-to-note ratio",        "Note Density",      "{:.3f}"),
    ("06_notes_per_minute",             "Notes per minute",          "Note Density",      "{:.1f}"),
    ("07_max_simultaneous_rh",          "Max simultaneous [RH]",     "Chords & Voicing",  "{:d}"),
    ("07_max_simultaneous_lh",          "Max simultaneous [LH]",     "Chords & Voicing",  "{:d}"),
    ("08_avg_simultaneous_rh",          "Avg simultaneous [RH]",     "Chords & Voicing",  "{:.3f}"),
    ("08_avg_simultaneous_lh",          "Avg simultaneous [LH]",     "Chords & Voicing",  "{:.3f}"),
    ("09_max_chord_span_st_rh",         "Max chord span st [RH]",    "Chords & Voicing",  "{:d}"),
    ("09_max_chord_span_st_lh",         "Max chord span st [LH]",    "Chords & Voicing",  "{:d}"),
    ("10_pct_chords_gt_octave",         "% chords > octave",         "Chords & Voicing",  "{:.1f}%"),
    ("11_cluster_density",              "Cluster density",           "Chords & Voicing",  "{:.4f}"),
    ("12_avg_melodic_interval_rh",      "Avg melodic interval [RH]", "Melodic Motion",    "{:.2f}"),
    ("12_avg_melodic_interval_lh",      "Avg melodic interval [LH]", "Melodic Motion",    "{:.2f}"),
    ("13_max_melodic_leap_rh",          "Max melodic leap [RH]",     "Melodic Motion",    "{:d}"),
    ("13_max_melodic_leap_lh",          "Max melodic leap [LH]",     "Melodic Motion",    "{:d}"),
    ("14_pct_intervals_gt_octave_rh",   "% intervals > oct [RH]",   "Melodic Motion",    "{:.1f}%"),
    ("14_pct_intervals_gt_octave_lh",   "% intervals > oct [LH]",   "Melodic Motion",    "{:.1f}%"),
    ("15_avg_hand_displacement_2sec",   "Hand displacement / 2s",    "Hand Coordination", "{:.2f}"),
    ("16_hand_crossing_count",          "Hand crossing count",       "Hand Coordination", "{:d}"),
    ("17_avg_voice_count",              "Avg voice count",           "Hand Coordination", "{:.2f}"),
    ("18_pct_measures_3plus_voices",    "% measures w/ 3+ voices",   "Hand Coordination", "{:.1f}%"),
    ("19_inter_hand_rhythmic_corr",     "Inter-hand rhythm corr",    "Hand Coordination", "{:.4f}"),
    ("20_sustained_overlap_freq",       "Sustained overlap freq",    "Hand Coordination", "{:.4f}"),
    ("21_tuplet_density",               "Tuplet density",            "Rhythm & Meter",    "{:.4f}"),
    ("22_syncopation_index",            "Syncopation index",         "Rhythm & Meter",    "{:.4f}"),
    ("23_polyrhythm_count",             "Polyrhythm count",          "Rhythm & Meter",    "{:d}"),
    ("24_distinct_rhythm_vals_per_measure", "Distinct rhythms / measure", "Rhythm & Meter", "{:.2f}"),
    ("25_time_sig_change_count",        "Time sig changes",          "Rhythm & Meter",    "{:d}"),
    ("26_accidental_density",           "Accidental density",        "Key & Accidentals", "{:.4f}"),
    ("27_key_sig_sharps_flats",         "Key sig sharps/flats",      "Key & Accidentals", "{:d}"),
    ("28_key_change_count",             "Key changes",               "Key & Accidentals", "{:d}"),
    ("29_repeated_note_density",        "Repeated note density",     "Ornaments & Patterns", "{:.4f}"),
    ("30_ornament_density",             "Ornament density",          "Ornaments & Patterns", "{:.4f}"),
]


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def rounded_rect(surface, rect, color, radius=8, border=0, border_color=None):
    r = pygame.Rect(rect)
    if border > 0 and border_color:
        pygame.draw.rect(surface, border_color, r, border_radius=radius)
        inner = r.inflate(-border * 2, -border * 2)
        pygame.draw.rect(surface, color, inner, border_radius=max(1, radius - border))
    else:
        pygame.draw.rect(surface, color, r, border_radius=radius)


def draw_text(surface, font, text, pos, color=TEXT, anchor="topleft"):
    rendered = font.render(text, True, color)
    rect = rendered.get_rect(**{anchor: pos})
    surface.blit(rendered, rect)
    return rect


def clamp(val, lo, hi):
    return max(lo, min(hi, val))


# ---------------------------------------------------------------------------
# GUI Components
# ---------------------------------------------------------------------------

class Button:
    def __init__(self, rect, label, font, color=ACCENT, bg=SURFACE2,
                 hover_bg=SURFACE3, enabled=True):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.font = font
        self.color = color
        self.bg = bg
        self.hover_bg = hover_bg
        self.hovered = False
        self.enabled = enabled

    def draw(self, surface):
        bg = self.hover_bg if (self.hovered and self.enabled) else self.bg
        col = self.color if self.enabled else TEXT_DIMMER
        bc = self.color if (self.hovered and self.enabled) else BORDER
        rounded_rect(surface, self.rect, bg, radius=10, border=1, border_color=bc)
        draw_text(surface, self.font, self.label, self.rect.center, col, anchor="center")

    def handle(self, event):
        if event.type == pygame.MOUSEMOTION:
            self.hovered = self.rect.collidepoint(event.pos)
        if (event.type == pygame.MOUSEBUTTONDOWN and event.button == 1
                and self.rect.collidepoint(event.pos) and self.enabled):
            return True
        return False


class TextInput:
    """Single-line text input for path entry."""
    def __init__(self, rect, font, placeholder=""):
        self.rect = pygame.Rect(rect)
        self.font = font
        self.text = ""
        self.placeholder = placeholder
        self.active = False
        self.cursor_timer = 0.0

    def handle(self, event):
        if event.type == pygame.MOUSEBUTTONDOWN:
            self.active = self.rect.collidepoint(event.pos)
        if event.type == pygame.KEYDOWN and self.active:
            if event.key == pygame.K_BACKSPACE:
                self.text = self.text[:-1]
            elif event.key == pygame.K_RETURN:
                return True
            elif event.key == pygame.K_v and (event.mod & pygame.KMOD_CTRL):
                try:
                    clip = pygame.scrap.get(pygame.SCRAP_TEXT)
                    if clip:
                        self.text += clip.decode("utf-8").strip("\x00")
                except Exception:
                    pass
            elif event.unicode and event.unicode.isprintable():
                self.text += event.unicode
        return False

    def draw(self, surface, dt):
        bc = ACCENT if self.active else BORDER
        rounded_rect(surface, self.rect, SURFACE2, radius=8, border=1, border_color=bc)
        display = self.text if self.text else self.placeholder
        col = TEXT if self.text else TEXT_DIMMER
        # Clip text to fit
        max_w = self.rect.width - 24
        while self.font.size(display)[0] > max_w and len(display) > 1:
            display = "..." + display[4:]
        draw_text(surface, self.font, display,
                  (self.rect.x + 12, self.rect.centery), col, anchor="midleft")
        if self.active:
            self.cursor_timer = (self.cursor_timer + dt) % 1.0
            if self.cursor_timer < 0.5:
                tw = self.font.size(self.text)[0]
                tw = min(tw, max_w)
                cx = self.rect.x + 12 + tw + 1
                pygame.draw.line(surface, ACCENT,
                                 (cx, self.rect.y + 8), (cx, self.rect.bottom - 8), 2)


class ScrollPanel:
    def __init__(self, rect):
        self.rect = pygame.Rect(rect)
        self.scroll_y = 0.0
        self.content_height = 0

    @property
    def max_scroll(self):
        return max(0, self.content_height - self.rect.height)

    def handle(self, event):
        if event.type == pygame.MOUSEWHEEL and self.rect.collidepoint(pygame.mouse.get_pos()):
            self.scroll_y = clamp(self.scroll_y - event.y * 40, 0, self.max_scroll)

    def draw_scrollbar(self, surface):
        if self.content_height <= self.rect.height:
            return
        bar_h = max(30, int(self.rect.height * (self.rect.height / self.content_height)))
        track_h = self.rect.height - 8
        ratio = self.scroll_y / self.max_scroll if self.max_scroll > 0 else 0
        bar_y = self.rect.y + 4 + int((track_h - bar_h) * ratio)
        pygame.draw.rect(surface, SURFACE3,
                         (self.rect.right - 8, bar_y, 5, bar_h), border_radius=3)


# ---------------------------------------------------------------------------
# Batch result entry
# ---------------------------------------------------------------------------

class FileResult:
    """Stores extraction result for one file."""
    __slots__ = ("filepath", "filename", "features", "metadata", "error")

    def __init__(self, filepath):
        self.filepath = filepath
        self.filename = os.path.basename(filepath)
        self.features = None
        self.metadata = None
        self.error = None


# ---------------------------------------------------------------------------
# Main Application
# ---------------------------------------------------------------------------

class App:
    def __init__(self):
        pygame.init()
        try:
            pygame.scrap.init()
        except Exception:
            pass

        self.screen = pygame.display.set_mode((WIN_W, WIN_H), pygame.RESIZABLE)
        pygame.display.set_caption("Piano Difficulty Analyzer")
        self.clock = pygame.time.Clock()
        self.running = True

        # Fonts
        def sf(names, size, bold=False):
            return pygame.font.SysFont(names, size, bold=bold)

        sans = "segoeui,arial,helvetica,dejavusans"
        mono = "jetbrainsmono,consolas,couriernew,dejavusansmono"

        self.f_title    = sf(sans, 28, bold=True)
        self.f_sub      = sf(sans, 13)
        self.f_btn      = sf(sans, 14, bold=True)
        self.f_md       = sf(sans, 15)
        self.f_sm       = sf(sans, 13)
        self.f_cat      = sf(sans, 12, bold=True)
        self.f_mono     = sf(mono, 14)
        self.f_mono_sm  = sf(mono, 12)
        self.f_file     = sf(sans, 13)
        self.f_file_sm  = sf(sans, 11)

        # State
        self.results = []            # list of FileResult
        self.selected_idx = -1       # which file is selected in the sidebar
        self.loading = False
        self.batch_progress = (0, 0) # (done, total)
        self.status_msg = "Enter a file or folder path, then press Load"
        self.status_color = TEXT_DIM

        # UI elements
        self.btn_load     = Button((0, 0, 100, 40), "Load",        self.f_btn)
        self.btn_json     = Button((0, 0, 110, 34), "Export JSON",  self.f_btn, color=GREEN, enabled=False)
        self.btn_csv      = Button((0, 0, 110, 34), "Export CSV",   self.f_btn, color=BLUE,  enabled=False)
        self.btn_csv_all  = Button((0, 0, 140, 34), "Export All CSV", self.f_btn, color=AMBER, enabled=False)
        self.text_input   = TextInput((0, 0, 400, 40), self.f_md,
                                      "Drop file/folder or paste path...")
        self.file_scroll  = ScrollPanel((0, 0, 100, 100))
        self.feat_scroll  = ScrollPanel((0, 0, 100, 100))

        self._layout()

    # ---- layout -----------------------------------------------------------

    def _layout(self):
        w, h = self.screen.get_size()

        self.text_input.rect = pygame.Rect(24, 80, w - 150, 38)
        self.btn_load.rect.topleft = (w - 118, 80)

        # Buttons row
        btn_y = 130
        self.btn_json.rect.topleft     = (24, btn_y)
        self.btn_csv.rect.topleft      = (142, btn_y)
        self.btn_csv_all.rect.topleft  = (260, btn_y)

        # File sidebar + feature panel
        panel_top = 175
        sidebar_w = 240
        self.file_scroll.rect = pygame.Rect(16, panel_top, sidebar_w, h - panel_top - 16)
        self.feat_scroll.rect = pygame.Rect(16 + sidebar_w + 8, panel_top,
                                            w - sidebar_w - 40, h - panel_top - 16)

    # ---- path handling ----------------------------------------------------

    @staticmethod
    def _find_music_files(folder):
        """Recursively find all music files in a folder."""
        files = []
        for root, dirs, fnames in os.walk(folder):
            # Skip hidden dirs
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fn in sorted(fnames):
                if Path(fn).suffix.lower() in MUSIC_EXTS:
                    files.append(os.path.join(root, fn))
        return files

    def _load_path(self, raw_path):
        """Determine if path is a file or folder, then start processing."""
        p = raw_path.strip().strip('"').strip("'")
        if not p:
            return

        if os.path.isdir(p):
            files = self._find_music_files(p)
            if not files:
                self.status_msg = f"No music files found in {p}"
                self.status_color = RED
                return
            self._start_batch(files)
        elif os.path.isfile(p):
            ext = Path(p).suffix.lower()
            if ext in MUSIC_EXTS:
                self._start_batch([p])
            else:
                self.status_msg = f"Unsupported file type: {ext}"
                self.status_color = RED
        else:
            self.status_msg = f"Path not found: {p}"
            self.status_color = RED

    def _start_batch(self, filepaths):
        """Begin batch extraction on a list of files."""
        self.results = [FileResult(fp) for fp in filepaths]
        self.selected_idx = 0
        self.loading = True
        self.batch_progress = (0, len(filepaths))
        self.status_msg = f"Processing 0 / {len(filepaths)} files..."
        self.status_color = AMBER
        self.btn_json.enabled = False
        self.btn_csv.enabled = False
        self.btn_csv_all.enabled = False
        self.file_scroll.scroll_y = 0
        self.feat_scroll.scroll_y = 0

        def worker():
            for i, res in enumerate(self.results):
                self.batch_progress = (i, len(self.results))
                self.status_msg = f"Processing {i+1} / {len(self.results)}: {res.filename}"
                try:
                    feats, meta = extract_features(res.filepath)
                    res.features = feats
                    res.metadata = meta
                except Exception as exc:
                    res.error = str(exc)
                    traceback.print_exc()

            done = sum(1 for r in self.results if r.features is not None)
            errs = sum(1 for r in self.results if r.error is not None)
            self.batch_progress = (len(self.results), len(self.results))
            parts = [f"{done} succeeded"]
            if errs:
                parts.append(f"{errs} failed")
            self.status_msg = f"Done — {', '.join(parts)} out of {len(self.results)} files"
            self.status_color = GREEN if errs == 0 else AMBER
            self.btn_csv_all.enabled = done > 0
            # Enable per-file export if current selection has data
            self._update_export_buttons()
            self.loading = False

        threading.Thread(target=worker, daemon=True).start()

    def _update_export_buttons(self):
        """Enable/disable per-file export buttons based on selection."""
        if 0 <= self.selected_idx < len(self.results):
            has_data = self.results[self.selected_idx].features is not None
            self.btn_json.enabled = has_data
            self.btn_csv.enabled = has_data
        else:
            self.btn_json.enabled = False
            self.btn_csv.enabled = False

    # ---- export -----------------------------------------------------------

    def _export_single(self, fmt):
        """Export current file's features as JSON or CSV."""
        if self.selected_idx < 0 or self.selected_idx >= len(self.results):
            return
        res = self.results[self.selected_idx]
        if not res.features:
            return
        combined = {**res.metadata, **res.features}
        stem = Path(res.filepath).stem
        parent = Path(res.filepath).parent

        if fmt == "json":
            out = parent / f"{stem}_features.json"
            with open(out, "w") as f:
                json.dump(combined, f, indent=2)
        else:
            out = parent / f"{stem}_features.csv"
            with open(out, "w", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=sorted(combined.keys()))
                writer.writeheader()
                writer.writerow(combined)
        self.status_msg = f"Saved {out}"
        self.status_color = GREEN

    def _export_all_csv(self):
        """Export all successful results into one combined CSV."""
        good = [r for r in self.results if r.features is not None]
        if not good:
            return

        # Determine output location: parent of first file
        parent = Path(good[0].filepath).parent
        out = parent / "all_features.csv"

        # Collect all possible keys
        all_keys = set()
        rows = []
        for r in good:
            combined = {**r.metadata, **r.features}
            all_keys.update(combined.keys())
            rows.append(combined)

        fieldnames = sorted(all_keys)
        with open(out, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)

        self.status_msg = f"Saved {len(rows)} rows → {out}"
        self.status_color = GREEN

    # ---- events -----------------------------------------------------------

    def _events(self):
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                self.running = False
                return

            if ev.type == pygame.VIDEORESIZE:
                self._layout()

            # Drag-and-drop: file or folder
            if ev.type == pygame.DROPFILE and not self.loading:
                self.text_input.text = ev.file
                self._load_path(ev.file)

            if not self.loading:
                if self.btn_load.handle(ev):
                    self._load_path(self.text_input.text)
                if self.btn_json.handle(ev):
                    self._export_single("json")
                if self.btn_csv.handle(ev):
                    self._export_single("csv")
                if self.btn_csv_all.handle(ev):
                    self._export_all_csv()

            if self.text_input.handle(ev) and not self.loading:
                self._load_path(self.text_input.text)

            # File list click
            if (ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1
                    and self.file_scroll.rect.collidepoint(ev.pos)):
                self._handle_file_click(ev.pos)

            self.file_scroll.handle(ev)
            self.feat_scroll.handle(ev)

            # Hover updates
            if ev.type == pygame.MOUSEMOTION:
                self.btn_load.handle(ev)
                self.btn_json.handle(ev)
                self.btn_csv.handle(ev)
                self.btn_csv_all.handle(ev)

    def _handle_file_click(self, pos):
        """Determine which file row was clicked."""
        panel = self.file_scroll.rect
        row_h = 44
        rel_y = pos[1] - panel.y + int(self.file_scroll.scroll_y)
        idx = int(rel_y // row_h)
        if 0 <= idx < len(self.results):
            self.selected_idx = idx
            self.feat_scroll.scroll_y = 0
            self._update_export_buttons()

    # ---- drawing ----------------------------------------------------------

    def _draw_header(self):
        w = self.screen.get_width()

        draw_text(self.screen, self.f_title, "Piano Difficulty Analyzer",
                  (w // 2, 14), ACCENT, anchor="midtop")
        draw_text(self.screen, self.f_sub, "MusicXML & MIDI  ·  Single file or batch folder",
                  (w // 2, 48), TEXT_DIM, anchor="midtop")

        self.text_input.draw(self.screen, self.clock.get_time() / 1000.0)
        self.btn_load.draw(self.screen)

        # Buttons row
        self.btn_json.draw(self.screen)
        self.btn_csv.draw(self.screen)
        self.btn_csv_all.draw(self.screen)

        # Status + progress bar
        status_y = 133
        status_x = self.btn_csv_all.rect.right + 20
        draw_text(self.screen, self.f_sm, self.status_msg,
                  (status_x, status_y + 10), self.status_color, anchor="midleft")

        if self.loading:
            # Animated dots
            dots = "." * ((pygame.time.get_ticks() // 400) % 4)
            sw = self.f_sm.size(self.status_msg)[0]
            draw_text(self.screen, self.f_sm, dots, (status_x + sw + 2, status_y + 10), AMBER)

            # Progress bar
            done, total = self.batch_progress
            if total > 0:
                bar_x = status_x
                bar_w = w - bar_x - 30
                bar_y = status_y + 24
                bar_h = 4
                pygame.draw.rect(self.screen, SURFACE3,
                                 (bar_x, bar_y, bar_w, bar_h), border_radius=2)
                fill_w = int(bar_w * (done / total))
                if fill_w > 0:
                    pygame.draw.rect(self.screen, ACCENT,
                                     (bar_x, bar_y, fill_w, bar_h), border_radius=2)

    def _draw_file_sidebar(self):
        """Draw the list of files on the left."""
        panel = self.file_scroll.rect
        rounded_rect(self.screen, panel, SURFACE, radius=12, border=1, border_color=BORDER)

        if not self.results:
            cx, cy = panel.center
            draw_text(self.screen, self.f_sm, "No files loaded",
                      (cx, cy), TEXT_DIMMER, anchor="center")
            return

        row_h = 44
        self.file_scroll.content_height = len(self.results) * row_h

        self.screen.set_clip(panel)

        for i, res in enumerate(self.results):
            y = panel.y + i * row_h - int(self.file_scroll.scroll_y)
            if y + row_h < panel.y or y > panel.bottom:
                continue

            row_rect = pygame.Rect(panel.x + 4, y + 2, panel.width - 8, row_h - 4)

            # Selected highlight
            if i == self.selected_idx:
                pygame.draw.rect(self.screen, SURFACE3, row_rect, border_radius=8)
                pygame.draw.rect(self.screen, ACCENT, row_rect, width=1, border_radius=8)
            elif row_rect.collidepoint(pygame.mouse.get_pos()):
                pygame.draw.rect(self.screen, SURFACE2, row_rect, border_radius=8)

            # Status indicator
            indicator_x = panel.x + 14
            indicator_y = y + row_h // 2
            if res.features is not None:
                pygame.draw.circle(self.screen, GREEN, (indicator_x, indicator_y), 4)
            elif res.error is not None:
                pygame.draw.circle(self.screen, RED, (indicator_x, indicator_y), 4)
            else:
                if self.loading:
                    # Pending: hollow circle
                    pygame.draw.circle(self.screen, TEXT_DIMMER, (indicator_x, indicator_y), 4, 1)
                else:
                    pygame.draw.circle(self.screen, TEXT_DIMMER, (indicator_x, indicator_y), 4)

            # Filename (truncate if needed)
            name = res.filename
            max_name_w = panel.width - 40
            while self.f_file.size(name)[0] > max_name_w and len(name) > 4:
                name = name[:-5] + "..."
            name_col = TEXT if res.features else (RED if res.error else TEXT_DIM)
            draw_text(self.screen, self.f_file, name,
                      (panel.x + 26, y + 8), name_col)

            # Subtitle: notes/duration or error
            if res.metadata:
                sub = f"{res.metadata['_meta_total_notes']} notes · {res.metadata['_meta_total_duration_sec']:.1f}s"
                draw_text(self.screen, self.f_file_sm, sub,
                          (panel.x + 26, y + 26), TEXT_DIMMER)
            elif res.error:
                err_short = res.error[:30] + "..." if len(res.error) > 30 else res.error
                draw_text(self.screen, self.f_file_sm, err_short,
                          (panel.x + 26, y + 26), RED)

        self.screen.set_clip(None)
        self.file_scroll.draw_scrollbar(self.screen)

    def _draw_features(self):
        """Draw the feature table for the selected file."""
        panel = self.feat_scroll.rect
        rounded_rect(self.screen, panel, SURFACE, radius=12, border=1, border_color=BORDER)

        # Get selected result
        if self.selected_idx < 0 or self.selected_idx >= len(self.results):
            cx, cy = panel.center
            if self.loading:
                draw_text(self.screen, self.f_md, "Processing...",
                          (cx, cy), AMBER, anchor="center")
            else:
                draw_text(self.screen, self.f_md, "Select a file to view features",
                          (cx, cy), TEXT_DIMMER, anchor="center")
            return

        res = self.results[self.selected_idx]

        if res.features is None:
            cx, cy = panel.center
            if res.error:
                draw_text(self.screen, self.f_md, f"Error: {res.error}",
                          (cx, cy), RED, anchor="center")
            elif self.loading:
                draw_text(self.screen, self.f_md, "Waiting to process...",
                          (cx, cy), AMBER, anchor="center")
            else:
                draw_text(self.screen, self.f_md, "No data",
                          (cx, cy), TEXT_DIMMER, anchor="center")
            return

        features = res.features

        # --- Render rows ---
        row_h = 30
        cat_h = 36
        pad = 12
        name_col_x = 48
        val_col_x = panel.width - 20

        # Content height
        cur_cat = None
        total_h = pad
        for _, _, fcat, _ in FEATURE_DEFS:
            if fcat != cur_cat:
                total_h += cat_h
                cur_cat = fcat
            total_h += row_h
        total_h += pad
        self.feat_scroll.content_height = total_h

        self.screen.set_clip(panel)

        y = panel.y + pad - int(self.feat_scroll.scroll_y)
        cur_cat = None
        row_idx = 0

        for fkey, fname, fcat, ffmt in FEATURE_DEFS:
            if fcat != cur_cat:
                cur_cat = fcat
                cat_text_col, cat_bg_col = CAT_COLORS.get(fcat, (ACCENT, SURFACE2))

                if panel.y - cat_h < y < panel.bottom:
                    cr = pygame.Rect(panel.x + 6, y + 3, panel.width - 12, cat_h - 3)
                    pygame.draw.rect(self.screen, cat_bg_col, cr, border_radius=8)
                    pygame.draw.rect(self.screen, cat_text_col,
                                     (panel.x + 10, y + 7, 3, cat_h - 11), border_radius=2)
                    draw_text(self.screen, self.f_cat, fcat.upper(),
                              (panel.x + 20, y + cat_h // 2 + 1), cat_text_col, anchor="midleft")
                y += cat_h
                row_idx = 0

            if panel.y - row_h < y < panel.bottom:
                if row_idx % 2 == 1:
                    pygame.draw.rect(self.screen, SURFACE2,
                                     (panel.x + 6, y, panel.width - 12, row_h),
                                     border_radius=6)

                num = fkey[:2]
                draw_text(self.screen, self.f_mono_sm, num,
                          (panel.x + 16, y + row_h // 2), TEXT_DIMMER, anchor="midleft")

                draw_text(self.screen, self.f_md, fname,
                          (panel.x + name_col_x, y + row_h // 2), TEXT, anchor="midleft")

                val = features.get(fkey)
                if val is None:
                    val_str = "—"
                else:
                    try:
                        val_str = ffmt.format(int(val) if "{:d}" in ffmt else float(val))
                    except (ValueError, TypeError):
                        val_str = str(val)

                cat_text_col, _ = CAT_COLORS.get(fcat, (ACCENT, SURFACE2))
                draw_text(self.screen, self.f_mono, val_str,
                          (panel.x + val_col_x, y + row_h // 2),
                          cat_text_col, anchor="midright")

            y += row_h
            row_idx += 1

        self.screen.set_clip(None)
        self.feat_scroll.draw_scrollbar(self.screen)

    # ---- main loop --------------------------------------------------------

    def run(self):
        while self.running:
            self._events()
            self.screen.fill(BG)
            self._draw_header()
            self._draw_file_sidebar()
            self._draw_features()
            pygame.display.flip()
            self.clock.tick(FPS)
        pygame.quit()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Piano Difficulty Analyzer GUI")
    parser.add_argument("path", nargs="?", help="File or folder to load on startup")
    args = parser.parse_args()

    app = App()
    if args.path:
        app.text_input.text = args.path
        app._load_path(args.path)
    app.run()


if __name__ == "__main__":
    main()