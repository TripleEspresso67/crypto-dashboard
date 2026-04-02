import { useNavigate } from 'react-router-dom';

export default function RatiosTable({ ratioData }) {
  const navigate = useNavigate();

  if (!ratioData || !ratioData.pairs || ratioData.pairs.length === 0) return null;

  const { pairs, dominance } = ratioData;

  // Approximate market-cap ordering for tie-breaks in Dominant Asset display.
  const MARKET_CAP_RANK = {
    BTC: 1,
    ETH: 2,
    BNB: 3,
    SOL: 4,
    DOGE: 5,
    SUI: 6,
    HYPE: 7,
  };

  const dominanceList = Object.entries(dominance)
    .map(([name, d]) => ({
      name,
      wins: d.wins,
      losses: d.losses,
      score: d.wins - d.losses,
    }))
    .sort((a, b) => b.score - a.score);

  const topScore = dominanceList[0]?.score ?? null;
  const topAssets = topScore === null
    ? []
    : dominanceList
      .filter(d => d.score === topScore)
      .sort((a, b) => {
        const rankA = MARKET_CAP_RANK[a.name] ?? Number.POSITIVE_INFINITY;
        const rankB = MARKET_CAP_RANK[b.name] ?? Number.POSITIVE_INFINITY;
        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name);
      });

  function signalClass(sig) {
    if (sig === 'LONG') return 'long';
    if (sig === 'CASH' || sig === 'SHORT') return 'cash';
    return 'neutral';
  }
  function displaySignal(sig) {
    return sig === 'CASH' ? 'SHORT' : sig;
  }

  function formatRatio(val) {
    if (val === undefined || isNaN(val)) return '--';
    if (!isFinite(val)) return val > 0 ? '+Inf' : '-Inf';
    return val.toFixed(2);
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
            {topAssets.map(a => a.name).join(', ')}
          </span>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {topAssets.map(asset => (
              <div key={asset.name}>
                {asset.name}: Outperforming {asset.wins} pairs, underperforming {asset.losses}, score {asset.score}
              </div>
            ))}
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
              <th>Score</th>
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
                <td style={{
                  color: '#ffffff',
                  fontWeight: 600
                }}>
                  {d.score > 0 ? '+' : ''}{d.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section">
        <h3 className="section-title">All Pair Ratios (MTTI-others)</h3>
        <div className="trade-list-container" style={{ maxHeight: 330, overflowY: 'auto' }}>
          <table className="trade-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
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
                  const interpretation = p.signal === 'LONG'
                    ? `${p.numerator} outperforming ${p.denominator}`
                    : `${p.denominator} outperforming ${p.numerator}`;
                  return (
                    <tr key={p.label} onClick={() => navigate(`/ratio/${idx}`)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>{p.label}</td>
                      <td style={{ fontWeight: 600 }}>
                        {p.score > 0 ? '+' : ''}{p.score.toFixed(2)}
                      </td>
                      <td>
                        <span className={`signal-badge ${signalClass(p.signal)}`}>
                          {displaySignal(p.signal)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {formatRatio(p.sharpe)}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {formatRatio(p.sortino)}
                      </td>
                      <td style={{ fontWeight: 600 }}>
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
