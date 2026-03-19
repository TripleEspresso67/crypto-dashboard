import { useNavigate } from 'react-router-dom';

export default function RatiosTable({ ratioData }) {
  const navigate = useNavigate();

  if (!ratioData || !ratioData.pairs || ratioData.pairs.length === 0) return null;

  const { pairs, dominance } = ratioData;

  const dominanceList = Object.entries(dominance)
    .map(([name, d]) => ({
      name,
      wins: d.wins,
      losses: d.losses,
      neutral: d.neutral,
      aggScore: d.score,
    }))
    .sort((a, b) => b.aggScore - a.aggScore);

  const topAsset = dominanceList[0];

  function signalClass(sig) {
    if (sig === 'LONG') return 'long';
    if (sig === 'CASH') return 'cash';
    return 'neutral';
  }

  function formatRatio(val) {
    if (val === undefined || isNaN(val)) return '--';
    if (!isFinite(val)) return val > 0 ? '+Inf' : '-Inf';
    return val.toFixed(2);
  }

  function ratioColor(val) {
    if (val === undefined || isNaN(val) || !isFinite(val)) return 'var(--text-secondary)';
    if (val > 0) return 'var(--green)';
    if (val < 0) return 'var(--red)';
    return 'var(--text-secondary)';
  }

  function omegaColor(val) {
    if (val === undefined || isNaN(val) || !isFinite(val)) return 'var(--text-secondary)';
    if (val > 1) return 'var(--green)';
    if (val < 1) return 'var(--red)';
    return 'var(--text-secondary)';
  }

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Dominant Asset</h3>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: 16, background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 8
        }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green)' }}>
            {topAsset.name}
          </span>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <div>Outperforming {topAsset.wins} pairs, underperforming {topAsset.losses}</div>
            <div>Aggregate score: {topAsset.aggScore.toFixed(3)}</div>
          </div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Asset Dominance Ranking</h3>
        <table className="score-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Asset</th>
              <th>Outperforming</th>
              <th>Underperforming</th>
              <th>Neutral</th>
              <th>Agg. Score</th>
            </tr>
          </thead>
          <tbody>
            {dominanceList.map((d, idx) => (
              <tr key={d.name}>
                <td>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>{d.name}</td>
                <td>
                  <span className="score-cell positive">{d.wins}</span>
                </td>
                <td>
                  <span className="score-cell negative">{d.losses}</span>
                </td>
                <td>
                  <span className="score-cell zero">{d.neutral}</span>
                </td>
                <td style={{
                  color: d.aggScore > 0 ? 'var(--green)' : d.aggScore < 0 ? 'var(--red)' : 'var(--text-secondary)',
                  fontWeight: 600
                }}>
                  {d.aggScore > 0 ? '+' : ''}{d.aggScore.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <h3 className="section-title">All Pair Ratios (MTTI-others)</h3>
        <div className="trade-list-container">
          <table className="trade-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Score</th>
                <th>Signal</th>
                <th>Sharpe</th>
                <th>Sortino</th>
                <th>Omega</th>
                <th>Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {pairs
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p, idx) => {
                  let interpretation = 'Neutral';
                  if (p.signal === 'LONG') {
                    interpretation = `${p.numerator} outperforming ${p.denominator}`;
                  } else if (p.signal === 'CASH') {
                    interpretation = `${p.denominator} outperforming ${p.numerator}`;
                  }
                    return (
                    <tr key={p.label} onClick={() => navigate(`/ratio/${idx}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td style={{
                        color: p.score > 0 ? 'var(--green)' : p.score < 0 ? 'var(--red)' : 'var(--text-secondary)',
                        fontWeight: 600
                      }}>
                        {p.score > 0 ? '+' : ''}{p.score.toFixed(3)}
                      </td>
                      <td>
                        <span className={`signal-badge ${signalClass(p.signal)}`}>
                          {p.signal}
                        </span>
                      </td>
                      <td style={{ color: ratioColor(p.sharpe), fontWeight: 600 }}>
                        {formatRatio(p.sharpe)}
                      </td>
                      <td style={{ color: ratioColor(p.sortino), fontWeight: 600 }}>
                        {formatRatio(p.sortino)}
                      </td>
                      <td style={{ color: omegaColor(p.omega), fontWeight: 600 }}>
                        {formatRatio(p.omega)}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {interpretation}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
