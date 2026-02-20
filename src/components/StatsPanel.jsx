import React from 'react';
import MiniChart from './MiniChart.jsx';
import { useStore } from '../store/index.js';

export default function StatsPanel() {
  const stats   = useStore(s => s.stats);
  const session = useStore(s => s.session);

  const { at = 0, co = 0, rt = [] } = session;
  const accuracy = at > 0 ? Math.round((co / at) * 100) : 0;
  const avgRt = rt.length > 0 ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0;
  const allTimeAcc = stats.ta > 0 ? Math.round((stats.tc / stats.ta) * 100) : null;

  return (
    <div className="stats-panel">
      <div className="section-title" style={{ marginBottom: 12 }}>Session Stats</div>

      <div className="stats-card">
        <div className="big-stat">{accuracy}%</div>
        <div className="big-stat-label">Session Accuracy</div>
      </div>

      <div className="stats-card">
        <div className="big-stat">{avgRt ? `${avgRt}ms` : '—'}</div>
        <div className="big-stat-label">Avg Reaction Time</div>
      </div>

      <div className="stats-card">
        <div className="stats-card-title">Breakdown</div>
        <div className="stats-row">
          <span className="setting-label">Attempts</span>
          <span className="setting-value">{at}</span>
        </div>
        <div className="stats-row">
          <span className="setting-label">Correct</span>
          <span className="setting-value" style={{ color: 'var(--correct-green)' }}>{co}</span>
        </div>
        <div className="stats-row">
          <span className="setting-label">Incorrect</span>
          <span className="setting-value" style={{ color: 'var(--incorrect-red)' }}>{at - co}</span>
        </div>
      </div>

      {rt.length > 1 && (
        <div className="stats-card">
          <div className="stats-card-title">Reaction Time Trend</div>
          <MiniChart data={rt} color="#d4a853" height={80} />
        </div>
      )}

      <div className="section-title" style={{ marginTop: 16, marginBottom: 12 }}>All-Time Stats</div>
      <div className="stats-card">
        <div className="stats-row">
          <span className="setting-label">Total Attempts</span>
          <span className="setting-value">{stats.ta}</span>
        </div>
        <div className="stats-row">
          <span className="setting-label">Overall Accuracy</span>
          <span className="setting-value">{allTimeAcc != null ? `${allTimeAcc}%` : '—'}</span>
        </div>
        <div className="stats-row">
          <span className="setting-label">Best Reaction</span>
          <span className="setting-value">{stats.br ? `${stats.br}ms` : '—'}</span>
        </div>
      </div>

      {(stats.rt ?? []).length > 1 && (
        <div className="stats-card">
          <div className="stats-card-title">Progress</div>
          <MiniChart data={stats.rt} color="#60a5fa" height={80} />
        </div>
      )}
    </div>
  );
}
