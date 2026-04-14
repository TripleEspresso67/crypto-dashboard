import { useState, useEffect } from 'react';
import { fetchFearGreedIndex, scoreFearGreed } from '../api/sentiment';
import { formatUtcDateTime } from '../dateTime';

const STORAGE_KEY = 'crypto-dashboard-fundamentals';

const ONCHAIN_INDICATORS = [
  {
    id: 'iefp',
    name: 'Short-Term Holder MVRV',
    source: 'CryptoQuant',
    url: 'https://cryptoquant.com/analytics/query/65df235c0168b95f8eac8dca?v=65df235c0168b95f8eac8dcc',
    options: [
      { value: '1', label: 'Bullish (+1)' },
      { value: '0', label: 'Neutral (0)' },
      { value: '-1', label: 'Bearish (-1)' },
    ],
  },
  {
    id: 'sth_sopr',
    name: 'STH-SOPR',
    source: 'ChartInspect',
    url: 'https://chartinspect.com/charts/sth-sopr?smoothing=SMA-30d',
    options: [
      { value: '1', label: 'Bullish (+1)' },
      { value: '0', label: 'Neutral (0)' },
      { value: '-1', label: 'Bearish (-1)' },
    ],
  },
  {
    id: 'sth_pl_momentum',
    name: 'STH Realized P/L Ratio Momentum',
    source: 'ChartInspect',
    url: 'https://chartinspect.com/charts/sth-realized-pl-ratio-momentum?chain=BTC&momentum=90d&unit=BTC&smoothing=SMA-90d',
    options: [
      { value: '1', label: 'Bullish (+1)' },
      { value: '0', label: 'Neutral (0)' },
      { value: '-1', label: 'Bearish (-1)' },
    ],
  },
];

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePersist(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function FundamentalsPanel() {
  const [inputs, setInputs] = useState(loadSaved);
  const [fearGreed, setFearGreed] = useState(null);
  const [fgError, setFgError] = useState(null);

  const [, setTick] = useState(0);

  useEffect(() => {
    fetchFearGreedIndex()
      .then(setFearGreed)
      .catch(err => setFgError(err.message));

    const fgInterval = setInterval(() => {
      fetchFearGreedIndex().then(setFearGreed).catch(() => {});
    }, 300000);

    const tickInterval = setInterval(() => setTick(t => t + 1), 60000);

    return () => {
      clearInterval(fgInterval);
      clearInterval(tickInterval);
    };
  }, []);

  function handleChange(id, value) {
    const updated = { ...inputs, [id]: value, [`${id}_ts`]: Date.now(), lastUpdated: Date.now() };
    setInputs(updated);
    savePersist(updated);
    window.dispatchEvent(new Event('fundamentals-updated'));
  }

  function timeAgo(ts) {
    if (!ts) return null;
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  const fgScore = fearGreed ? scoreFearGreed(fearGreed.value) : null;

  function scoreClass(s) {
    if (s > 0) return 'positive';
    if (s < 0) return 'negative';
    return 'zero';
  }

  function fgBarColor(val) {
    if (val <= 25) return 'var(--red)';
    if (val <= 45) return '#e8963e';
    if (val <= 55) return 'var(--yellow)';
    if (val <= 75) return '#8bc34a';
    return 'var(--green)';
  }

  return (
    <div>
      {/* Crypto Sentiment - auto-fetched */}
      <div className="section">
        <h3 className="section-title">Crypto Sentiment</h3>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 16,
        }}>
          {fgError && <div style={{ color: 'var(--red)', fontSize: '0.8rem' }}>{fgError}</div>}
          {fearGreed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Fear & Greed Index
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 700, color: fgBarColor(fearGreed.value) }}>
                    {fearGreed.value}
                  </span>
                  <span style={{ fontSize: '1rem', color: fgBarColor(fearGreed.value) }}>
                    {fearGreed.classification}
                  </span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{
                  height: 10, borderRadius: 5,
                  background: 'linear-gradient(to right, var(--red), #e8963e, var(--yellow), #8bc34a, var(--green))',
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', top: -4, left: `${fearGreed.value}%`,
                    transform: 'translateX(-50%)',
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#fff', border: '2px solid var(--bg-primary)',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>Extreme Fear</span><span>Extreme Greed</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Signal Score</div>
                <span className={`score-cell ${scoreClass(fgScore)}`} style={{ fontSize: '1.25rem' }}>
                  {fgScore > 0 ? '+1' : fgScore < 0 ? '-1' : '0'}
                </span>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Contrarian: fear=bullish, greed=bearish
                </div>
              </div>
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Loading sentiment data...</span>
          )}
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8 }}>
            Source: <a href="https://www.coinglass.com/pro/i/FearGreedIndex" target="_blank" rel="noreferrer">CoinGlass</a> / <a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noreferrer">Alternative.me</a>
          </div>
        </div>
      </div>

      {/* On-Chain Fundamentals - manual input */}
      <div className="section">
        <h3 className="section-title">Fundamental Indicators</h3>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{ display: 'grid', gap: 16 }}>
            {ONCHAIN_INDICATORS.map(ind => (
              <div key={ind.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                paddingBottom: 12, borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{ind.name}</div>
                  {ind.id === 'sth_sopr' && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Smoothing: DEMA 90 Days
                    </div>
                  )}
                  {ind.id === 'sth_pl_momentum' && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Momentum: 90 Days · Smoothing: SMA 90 Days
                    </div>
                  )}
                  <a href={ind.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: '0.7rem', color: 'var(--blue)' }}>
                    {ind.source} &rarr;
                  </a>
                </div>
                <div style={{ flex: '0 0 180px' }}>
                  <select
                    value={inputs[ind.id] ?? ''}
                    onChange={e => handleChange(ind.id, e.target.value)}
                    style={{
                      width: '100%', padding: '6px 10px', fontSize: '0.8rem',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      border: '1px solid var(--border)', borderRadius: 4,
                    }}
                  >
                    <option value="">-- Select --</option>
                    {ind.options.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '0 0 50px', textAlign: 'center' }}>
                  {inputs[ind.id] !== undefined && inputs[ind.id] !== '' ? (
                    <span className={`score-cell ${scoreClass(parseInt(inputs[ind.id], 10))}`}>
                      {(() => {
                        const s = parseInt(inputs[ind.id], 10);
                        return s > 0 ? '+1' : s < 0 ? '-1' : '0';
                      })()}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</span>
                  )}
                </div>
                <div style={{ flex: '0 0 120px', textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {inputs[`${ind.id}_ts`] ? (
                    <span title={`${formatUtcDateTime(inputs[`${ind.id}_ts`])} UTC`}>
                      Updated {timeAgo(inputs[`${ind.id}_ts`])}
                    </span>
                  ) : (
                    <span>Not set</span>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

    </div>
  );
}
