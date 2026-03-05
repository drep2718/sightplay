import React, { useState } from 'react';
import { api } from '../hooks/useApi.js';

/**
 * Collapsible panel showing saved pieces. Shown above the upload dropzone in SheetMusicMode.
 * Props:
 *   pieces    — array from store
 *   onLoad    — (piece) => void  — called with { id, title, file_type, file_content }
 *   onRefresh — () => void        — called to reload the list from the store
 */
export default function PieceLibrary({ pieces, onLoad, onRefresh }) {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(null); // piece id being loaded
  const [toast,     setToast]     = useState(null); // { msg, ok }
  const [renaming,  setRenaming]  = useState(null); // piece id in rename mode
  const [renameVal, setRenameVal] = useState('');

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2200);
  }

  async function handleLoad(piece) {
    setLoading(piece.id);
    try {
      const { data } = await api.get(`/pieces/${piece.id}`);
      await api.patch(`/pieces/${piece.id}/played`);
      onLoad(data.piece);
    } catch {
      showToast('Failed to load piece', false);
    } finally {
      setLoading(null);
    }
  }

  async function handleFavorite(e, piece) {
    e.stopPropagation();
    try {
      await api.patch(`/pieces/${piece.id}/favorite`);
      onRefresh();
    } catch { /* ignore */ }
  }

  function startRename(e, piece) {
    e.stopPropagation();
    setRenaming(piece.id);
    setRenameVal(piece.title);
  }

  async function commitRename(piece) {
    const trimmed = renameVal.trim();
    if (!trimmed || trimmed === piece.title) { setRenaming(null); return; }
    try {
      await api.patch(`/pieces/${piece.id}/rename`, { title: trimmed });
      showToast('Renamed');
      onRefresh();
    } catch {
      showToast('Failed to rename', false);
    } finally {
      setRenaming(null);
    }
  }

  async function handleDelete(e, piece) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${piece.title}"?`)) return;
    try {
      await api.delete(`/pieces/${piece.id}`);
      showToast('Piece deleted');
      onRefresh();
    } catch {
      showToast('Failed to delete', false);
    }
  }

  if (!pieces?.length) return null;

  return (
    <div className="piece-library">
      <button className="piece-library-toggle" onClick={() => setOpen(o => !o)}>
        <span>Library ({pieces.length})</span>
        <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="piece-library-grid">
          {pieces.map(p => (
            <div
              key={p.id}
              className="piece-card"
              onClick={() => handleLoad(p)}
              title={loading === p.id ? 'Loading…' : `Load "${p.title}"`}
            >
              {renaming === p.id ? (
                <input
                  className="piece-rename-input"
                  value={renameVal}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={() => commitRename(p)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') { setRenaming(null); }
                  }}
                />
              ) : (
                <div className="piece-card-title">{p.title}</div>
              )}
              <div className="piece-card-meta">
                <span className="format-tag">{p.file_type}</span>
                {p.tempo && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.tempo} BPM</span>}
                {p.time_sig && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{p.time_sig}</span>}
                {p.play_count > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>×{p.play_count}</span>
                )}
              </div>
              <div className="piece-card-actions">
                <button
                  className={`piece-fav-btn${p.is_favorite ? ' active' : ''}`}
                  onClick={e => handleFavorite(e, p)}
                  title={p.is_favorite ? 'Unfavorite' : 'Favorite'}
                >
                  {p.is_favorite ? '★' : '☆'}
                </button>
                <button
                  className="piece-rename-btn"
                  onClick={e => startRename(e, p)}
                  title="Rename"
                >
                  ✎
                </button>
                <button
                  className="piece-del-btn"
                  onClick={e => handleDelete(e, p)}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              {loading === p.id && (
                <div className="piece-card-loading">Loading…</div>
              )}
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className={`piece-toast${toast.ok ? '' : ' error'}`}>{toast.msg}</div>
      )}
    </div>
  );
}
