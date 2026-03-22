import { useNavigate } from 'react-router-dom';
import RatiosTable from './RatiosTable';
import FundamentalsPanel from './FundamentalsPanel';

export default function Overview({ assetData, ratioData, loading, error }) {
  const navigate = useNavigate();

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

      <FundamentalsPanel />

      {ratioData && ratioData.pairs.length > 0 && (
        <RatiosTable ratioData={ratioData} />
      )}
    </div>
  );
}
