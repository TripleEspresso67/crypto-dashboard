import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import RatiosTable from './RatiosTable';
import FundamentalsPanel from './FundamentalsPanel';
import AllocationSection from './AllocationSection';

function rankDescending(values) {
  const indices = values.map((_, i) => i);
  indices.sort((a, b) => values[b] - values[a]);
  const ranks = new Array(values.length);
  for (let r = 0; r < indices.length; r++) ranks[indices[r]] = r + 1;
  return ranks;
}

function parseNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? -Infinity : n;
}

export default function Overview({ assetData, ratioData, loading, error }) {
  const navigate = useNavigate();

  const assetPerf = useMemo(() => {
    if (!assetData || assetData.length === 0) return [];
    const rows = assetData.map((a, idx) => ({
      idx,
      name: a.config.name,
      strategy: `${a.config.strategy} ${a.config.interval.toUpperCase()}`,
      totalReturn: a.backtest?.stats?.totalReturn ?? '--',
      maxDrawdown: a.backtest?.stats?.maxDrawdown ?? '--',
      sortino: a.backtest?.stats?.sortino ?? '--',
      omega: a.backtest?.stats?.omega ?? '--',
    }));

    const retVals = rows.map(r => parseNum(r.totalReturn));
    const ddVals = rows.map(r => -parseNum(r.maxDrawdown));
    const sorVals = rows.map(r => parseNum(r.sortino));
    const omgVals = rows.map(r => parseNum(r.omega));

    const retRanks = rankDescending(retVals);
    const ddRanks = rankDescending(ddVals);
    const sorRanks = rankDescending(sorVals);
    const omgRanks = rankDescending(omgVals);

    const cumScores = rows.map((_, i) => retRanks[i] + ddRanks[i] + sorRanks[i] + omgRanks[i]);
    const indices = rows.map((_, i) => i);
    indices.sort((a, b) => cumScores[a] - cumScores[b]);
    const overallRanks = new Array(rows.length);
    for (let r = 0; r < indices.length; r++) overallRanks[indices[r]] = r + 1;

    for (let i = 0; i < rows.length; i++) rows[i].overallRank = overallRanks[i];
    rows.sort((a, b) => a.overallRank - b.overallRank);
    return rows;
  }, [assetData]);

  if (error) {
    return <div className="error-msg">{error}</div>;
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Fetching market data and computing indicators...</p>
        <p style={{ fontSize: '0.8rem', marginTop: 8, color: 'var(--text-muted)' }}>
          This may take a moment on first load
        </p>
      </div>
    );
  }

  function formatPrice(p) {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  }

  function formatDate(ts) {
    if (!ts || isNaN(ts)) return '';
    return new Date(ts).toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Asset Strategies</h3>
        <div className="overview-grid">
          {assetData.map((asset, idx) => {
            const lastCandle = asset.candles[asset.candles.length - 1];
            const lastScore = asset.compositeScores[asset.compositeScores.length - 1];
            const lastSignal = asset.signals[asset.signals.length - 1];

            let lastSignalChange = NaN;
            for (let i = asset.signals.length - 2; i >= 0; i--) {
              if (asset.signals[i] !== lastSignal) {
                lastSignalChange = asset.candles[i + 1].time;
                break;
              }
            }

            return (
              <div
                key={idx}
                className="asset-card"
                onClick={() => navigate(`/asset/${idx}`)}
              >
                <div className="card-header">
                  <span className="asset-name">{asset.config.name}</span>
                  <span className="strategy-badge">{asset.config.strategy} {asset.config.interval.toUpperCase()}</span>
                </div>
                <div className="price">{formatPrice(lastCandle.close)}</div>
                <div className="score-row">
                  <span className="composite-score">
                    Score: {lastScore.toFixed(2)}
                  </span>
                  <span className={`signal-badge ${lastSignal.toLowerCase()}`}>
                    {lastSignal}
                  </span>
                </div>
                {!isNaN(lastSignalChange) && (
                  <div className="last-change">
                    Signal since {formatDate(lastSignalChange)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {assetPerf.length > 0 && (
        <div className="section">
          <h3 className="section-title">Asset Strategy Performance</h3>
          <table className="score-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Strategy</th>
                <th style={{ textAlign: 'right' }}>Total Return</th>
                <th style={{ textAlign: 'right' }}>Max Drawdown</th>
                <th style={{ textAlign: 'right' }}>Sortino</th>
                <th style={{ textAlign: 'right' }}>Omega</th>
                <th style={{ textAlign: 'right' }}>Overall Rank</th>
              </tr>
            </thead>
            <tbody>
              {assetPerf.map(r => (
                <tr
                  key={r.idx}
                  onClick={() => navigate(`/asset/${r.idx}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.strategy}</td>
                  <td style={{ textAlign: 'right' }}>{r.totalReturn}%</td>
                  <td style={{ textAlign: 'right' }}>{r.maxDrawdown}%</td>
                  <td style={{ textAlign: 'right' }}>{r.sortino}</td>
                  <td style={{ textAlign: 'right' }}>{r.omega}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.overallRank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FundamentalsPanel />

      {ratioData && ratioData.pairs.length > 0 && (
        <RatiosTable ratioData={ratioData} />
      )}

      <AllocationSection assetData={assetData} ratioData={ratioData} />
    </div>
  );
}
