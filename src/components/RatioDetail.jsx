import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PriceChart from './PriceChart';
import EquityCurve from './EquityCurve';
import ScoreTable from './ScoreTable';
import StatsPanel from './StatsPanel';
import TradeList from './TradeList';
import { runBacktest, DEFAULT_BACKTEST_START } from '../backtest/engine';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig';

const DATE_PRESETS = [
  { label: '1 Jan 2020', value: '2020-01-01' },
  { label: '1 Jan 2021', value: '2021-01-01' },
  { label: '1 Jan 2022', value: '2022-01-01' },
  { label: '1 Jan 2023', value: '2023-01-01' },
  { label: '1 Jan 2024', value: '2024-01-01' },
  { label: '1 Jan 2025', value: '2025-01-01' },
  { label: 'Custom', value: 'custom' },
];

function toDateStr(ts) {
  const d = new Date(ts);
  return d.toISOString().split('T')[0];
}

export default function RatioDetail({ ratioData, loading }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const idx = parseInt(id, 10);

  const defaultDateStr = toDateStr(DEFAULT_BACKTEST_START);
  const [selectedPreset, setSelectedPreset] = useState(defaultDateStr);
  const [customDate, setCustomDate] = useState(defaultDateStr);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = new Date(activeDateStr + 'T00:00:00Z').getTime();

  const sortedPairs = ratioData?.pairs?.slice().sort((a, b) => b.score - a.score);
  const pair = sortedPairs?.[idx] ?? null;

  const recomputedBacktest = useMemo(() => {
    if (!pair) return null;
    return runBacktest(
      pair.candles,
      pair.compositeScores,
      MTTI_OTHERS_PARAMS.longThresh,
      MTTI_OTHERS_PARAMS.shortThresh,
      backtestStart
    );
  }, [pair, backtestStart]);

  const buyHoldEquity = useMemo(() => {
    if (!pair) return null;
    const candles = pair.candles;
    const startIdx = candles.findIndex(c => c.time >= backtestStart);
    if (startIdx === -1) return [];
    const firstClose = candles[startIdx].close;
    if (firstClose === 0) return [];
    const initialCapital = 1000;
    return candles.slice(startIdx).map(c => ({
      time: c.time,
      value: initialCapital * (c.close / firstClose),
    }));
  }, [pair, backtestStart]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="detail-page">
        <span className="back-link" onClick={() => navigate('/')}>
          &larr; Crypto Strategy Dashboard
        </span>
        <div className="error-msg">Ratio pair not found.</div>
      </div>
    );
  }

  const lastScore = pair.compositeScores[pair.compositeScores.length - 1];
  const lastSignal = pair.signals[pair.signals.length - 1];
  const lastCandle = pair.candles[pair.candles.length - 1];

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCustomDate(val);
    }
  }

  return (
    <div className="detail-page">
      <span className="back-link" onClick={() => navigate('/')}>
        &larr; Crypto Strategy Dashboard
      </span>

      <div className="detail-header">
        <div>
          <h2>{pair.label} Ratio</h2>
          <span className="composite-score" style={{ fontSize: '1rem' }}>
            Composite Score: {lastScore.toFixed(2)} &mdash;{' '}
            <span className={`signal-badge ${lastSignal.toLowerCase()}`}>
              {lastSignal}
            </span>
          </span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            {lastSignal === 'LONG'
              ? `${pair.numerator} outperforming ${pair.denominator}`
              : lastSignal === 'CASH'
              ? `${pair.denominator} outperforming ${pair.numerator}`
              : 'Neutral'}
            {' '}&middot; Strategy: MTTI-others
          </div>
        </div>
        <div className="detail-price">{lastCandle.close.toFixed(6)}</div>
      </div>

      <div className="section">
        <h3 className="section-title">Ratio Price Chart</h3>
        <PriceChart
          candles={pair.candles}
          signals={pair.signals}
          backtestStart={backtestStart}
          indicatorResults={pair.indicatorResults}
          compositeScores={pair.compositeScores}
        />
      </div>

      <div className="section">
        <h3 className="section-title">Indicator Scoreboard</h3>
        <ScoreTable
          indicatorResults={pair.indicatorResults}
          candles={pair.candles}
        />
      </div>

      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Backtest Performance
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Backtest from:
            </label>
            <select
              value={selectedPreset}
              onChange={handlePresetChange}
              style={{
                padding: '5px 10px', fontSize: '0.8rem',
                background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 4,
              }}
            >
              {DATE_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            {selectedPreset === 'custom' && (
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                style={{
                  padding: '5px 10px', fontSize: '0.8rem',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 4,
                }}
              />
            )}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <StatsPanel stats={recomputedBacktest?.stats} />
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Equity Curve</h3>
        <EquityCurve equity={recomputedBacktest?.equity} buyHoldEquity={buyHoldEquity} />
      </div>

      <div className="section">
        <h3 className="section-title">Trade History</h3>
        <TradeList trades={recomputedBacktest?.trades} />
      </div>
    </div>
  );
}
