import React, { useEffect, useRef } from 'react';
import MiniChart from './MiniChart.jsx';
import { useStore } from '../store/index.js';

/** Tiny bar chart — accuracy per session (0-100%) */
function AccuracyBars({ data }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pts  = data.slice(-20);
    const barW = Math.max(4, Math.floor((w - (pts.length - 1) * 3) / pts.length));

    pts.forEach((v, i) => {
      const barH  = Math.max(2, (v / 100) * (h - 14));
      const x     = i * (barW + 3);
      const y     = h - barH;
      const alpha = 0.4 + (i / pts.length) * 0.6;
      ctx.fillStyle = v >= 80 ? `rgba(74,222,128,${alpha})` :
                      v >= 60 ? `rgba(212,168,83,${alpha})` :
                                `rgba(248,113,113,${alpha})`;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 2);
      ctx.fill();
    });

    // Y label 100%
    ctx.fillStyle = '#5a5a6f';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.fillText('100%', w - 28, 10);
  }, [data]);

  return <canvas ref={ref} width={240} height={70} style={{ width: '100%', height: 70 }} />;
}

export default function StatsPanel() {
  const stats          = useStore(s => s.stats);
  const session        = useStore(s => s.session);
  const sessionHistory = useStore(s => s.sessionHistory);

  const { at = 0, co = 0, rt = [] } = session;
  const accuracy   = at > 0 ? Math.round((co / at) * 100) : 0;
  const avgRt      = rt.length > 0 ? Math.round(rt.reduce((a, b) => a + b, 0) / rt.length) : 0;
  const allTimeAcc = stats.ta > 0 ? Math.round((stats.tc / stats.ta) * 100) : null;

  // Derive accuracy-per-session series from history
  const sessionAccuracies = sessionHistory
    .filter(s => s.total_attempts > 0)
    .map(s => Math.round((s.total_correct / s.total_attempts) * 100));

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
          <div className="stats-card-title">Reaction Time (this session)</div>
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

      {sessionAccuracies.length > 1 && (
        <div className="stats-card">
          <div className="stats-card-title">Accuracy by Session (last 20)</div>
          <AccuracyBars data={sessionAccuracies} />
        </div>
      )}

      {(stats.rt ?? []).length > 1 && (
        <div className="stats-card">
          <div className="stats-card-title">Reaction Time Trend</div>
          <MiniChart data={stats.rt} color="#60a5fa" height={80} />
        </div>
      )}
    </div>
  );
}
