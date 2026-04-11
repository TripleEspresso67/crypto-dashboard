import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import PriceChart from './PriceChart';
import EquityCurve from './EquityCurve';
import ScoreTable from './ScoreTable';
import StatsPanel from './StatsPanel';
import TradeList from './TradeList';
import { runBacktest } from '../backtest/engine';
import { MTTI_BTC_PARAMS } from '../strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from '../strategies/mttiOthersConfig';
import { LTTI_PARAMS } from '../strategies/lttiConfig';
import { BACKTEST_DATE_PRESETS, DEFAULT_BACKTEST_START_DATE } from '../constants/backtestDates';

const STRATEGY_PARAMS = {
  'LTTI': LTTI_PARAMS,
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

export default function AssetDetail({ assetData, loading }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const idx = parseInt(id, 10);
  const fallbackPath = '/';
  const fromPath = location.state?.from || fallbackPath;

  function handleBack() {
    navigate(fromPath);
  }

  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_BACKTEST_START_DATE);
  const [customDate, setCustomDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [longThreshStr, setLongThreshStr] = useState(null);
  const [shortThreshStr, setShortThreshStr] = useState(null);

  const activeDateStr = selectedPreset === 'custom' ? customDate : selectedPreset;
  const backtestStart = new Date(activeDateStr + 'T00:00:00Z').getTime();

  const asset = assetData?.[idx] ?? null;
  const stratParams = asset ? STRATEGY_PARAMS[asset.config.strategy] : null;

  const longThresh = longThreshStr !== null ? parseFloat(longThreshStr) : (stratParams?.longThresh ?? 0.1);
  const shortThresh = shortThreshStr !== null ? parseFloat(shortThreshStr) : (stratParams?.shortThresh ?? -0.1);

  const recomputedSignals = useMemo(() => {
    if (!asset) return null;
    const signals = new Array(asset.compositeScores.length).fill('CASH');
    for (let i = 0; i < asset.compositeScores.length; i++) {
      const s = asset.compositeScores[i];
      if (s >= longThresh) signals[i] = 'LONG';
      else if (s <= shortThresh) signals[i] = 'CASH';
      else signals[i] = i > 0 ? signals[i - 1] : 'CASH';
    }
    return signals;
  }, [asset, longThresh, shortThresh]);

  const recomputedBacktest = useMemo(() => {
    if (!asset) return null;
    return runBacktest(
      asset.candles,
      asset.compositeScores,
      longThresh,
      shortThresh,
      backtestStart
    );
  }, [asset, backtestStart, longThresh, shortThresh]);

  const buyHoldEquity = useMemo(() => {
    if (!asset) return null;
    const candles = asset.candles;
    const startIdx = candles.findIndex(c => c.time >= backtestStart);
    if (startIdx === -1) return [];
    const firstClose = candles[startIdx].close;
    if (firstClose === 0) return [];
    const initialCapital = 1000;
    return candles.slice(startIdx).map(c => ({
      time: c.time,
      value: initialCapital * (c.close / firstClose),
    }));
  }, [asset, backtestStart]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="detail-page">
        <span className="back-link" onClick={handleBack}>
          &larr; Back
        </span>
        <div className="error-msg">Asset not found.</div>
      </div>
    );
  }

  const lastCandle = asset.candles[asset.candles.length - 1];
  const lastScore = asset.compositeScores[asset.compositeScores.length - 1];
  const lastSignal = recomputedSignals[recomputedSignals.length - 1];

  function formatPrice(p) {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (p >= 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(6)}`;
  }

  function handlePresetChange(e) {
    const val = e.target.value;
    setSelectedPreset(val);
    if (val !== 'custom') {
      setCustomDate(val);
    }
  }

  return (
    <div className="detail-page">
      <span className="back-link" onClick={handleBack}>
        &larr; Back
      </span>

      <div className="detail-header">
        <div>
          <h2>{asset.config.label}</h2>
          <span className="composite-score" style={{ fontSize: '1rem' }}>
            Composite Score: {lastScore.toFixed(2)} &mdash;{' '}
            <span className={`signal-badge ${lastSignal.toLowerCase()}`}>
              {lastSignal}
            </span>
          </span>
        </div>
        <div className="detail-price">{formatPrice(lastCandle.close)}</div>
      </div>

      <div className="section">
        <h3 className="section-title">Price Chart</h3>
        <PriceChart
          candles={asset.candles}
          signals={recomputedSignals}
          backtestStart={backtestStart}
          indicatorResults={asset.indicatorResults}
          compositeScores={asset.compositeScores}
        />
      </div>

      <div className="section">
        <h3 className="section-title">Indicator Scoreboard</h3>
        <ScoreTable
          indicatorResults={asset.indicatorResults}
          candles={asset.candles}
        />
      </div>

      <div className="section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <h3 className="section-title" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0 }}>
            Backtest Performance
          </h3>
          <div className="controls-row" style={{ gap: 16, marginBottom: 0 }}>
            <div className="controls-row" style={{ marginBottom: 0 }}>
              <label className="control-label">Backtest from:</label>
              <select
                value={selectedPreset}
                onChange={handlePresetChange}
                className="control-input"
              >
                {BACKTEST_DATE_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {selectedPreset === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={e => setCustomDate(e.target.value)}
                  className="control-input"
                />
              )}
            </div>
            <div className="controls-row" style={{ marginBottom: 0 }}>
              <label className="control-label">Long:</label>
              <input
                type="number"
                step="0.01"
                value={longThreshStr !== null ? longThreshStr : stratParams.longThresh}
                onChange={e => setLongThreshStr(e.target.value)}
                style={{
                  width: 65,
                }}
                className="control-input"
              />
              <label className="control-label">Short:</label>
              <input
                type="number"
                step="0.01"
                value={shortThreshStr !== null ? shortThreshStr : stratParams.shortThresh}
                onChange={e => setShortThreshStr(e.target.value)}
                style={{
                  width: 65,
                }}
                className="control-input"
              />
            </div>
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
