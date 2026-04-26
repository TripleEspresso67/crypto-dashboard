import { useEffect, useMemo, useState } from 'react';
import { formatUtcDate } from '../dateTime';

const FUNDAMENTALS_STORAGE_KEY = 'crypto-dashboard-fundamentals';
const REQUIRED_FUNDAMENTAL_IDS = ['avs_trend', 'iefp', 'sth_sopr', 'sth_pl_momentum'];

function fmtScore(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '--';
}

function signalClass(signal) {
  if (!signal) return 'neutral';
  const normalized = signal.toLowerCase();
  if (normalized === 'long' || normalized === 'short' || normalized === 'cash') return normalized;
  return 'neutral';
}

function loadFundamentalInputs() {
  try {
    const raw = localStorage.getItem(FUNDAMENTALS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function StrategySignalCard({ title, strategyLabel, asset }) {
  const score = asset?.compositeScores?.[asset.compositeScores.length - 1];
  const signal = asset?.signals?.[asset.signals.length - 1];

  return (
    <div className="asset-card" style={{ cursor: 'default' }}>
      <div className="card-header">
        <span className="asset-name">{title}</span>
        <span className="strategy-badge">{strategyLabel}</span>
      </div>
      <div className="score-row" style={{ marginTop: 8 }}>
        <span className="composite-score">Score: {fmtScore(score)}</span>
        <span className={`signal-badge ${signalClass(signal)}`}>
          {signal || '--'}
        </span>
      </div>
    </div>
  );
}

export default function DashboardOverview({ loading, error, mttiBtc1d, ltti3d, starredStrategySummary }) {
  const [fundamentalInputs, setFundamentalInputs] = useState({});

  useEffect(() => {
    const syncFundamentals = () => setFundamentalInputs(loadFundamentalInputs());
    syncFundamentals();
    window.addEventListener('fundamentals-updated', syncFundamentals);
    return () => window.removeEventListener('fundamentals-updated', syncFundamentals);
  }, []);

  const fundamentalsReady = useMemo(
    () => REQUIRED_FUNDAMENTAL_IDS.every(id => fundamentalInputs[id] !== undefined && fundamentalInputs[id] !== ''),
    [fundamentalInputs]
  );
  const fundamentalAggregate = useMemo(() => {
    if (!fundamentalsReady) return null;
    const values = REQUIRED_FUNDAMENTAL_IDS
      .map(id => parseInt(fundamentalInputs[id], 10))
      .filter(Number.isFinite);
    if (values.length !== REQUIRED_FUNDAMENTAL_IDS.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [fundamentalInputs, fundamentalsReady]);
  const fundamentalSignal = fundamentalAggregate === null
    ? '--'
    : fundamentalAggregate > 0
      ? 'Long'
      : fundamentalAggregate < 0
        ? 'Short'
        : 'Neutral';
  const allocationRows = starredStrategySummary?.allocations || [];
  const todayUtcDate = formatUtcDate(Date.now());

  if (error) return <div className="error-msg">{error}</div>;

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading overview...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section">
        <h3 className="section-title">Signal Overview</h3>
        <div className="overview-grid">
          <StrategySignalCard
            title="BTC"
            strategyLabel="MTTI-BTC 1D"
            asset={mttiBtc1d}
          />
          <StrategySignalCard
            title="Technical 3D LTTI"
            strategyLabel="LTTI 3D"
            asset={ltti3d}
          />
          <div className="asset-card" style={{ cursor: 'default' }}>
            <div className="card-header">
              <span className="asset-name">Fundamental LTTI</span>
              <span className="strategy-badge">Aggregate</span>
            </div>
            <div className="score-row" style={{ marginTop: 8 }}>
              <span className="composite-score">
                Score: {fmtScore(fundamentalAggregate)}
              </span>
              <span className={`signal-badge ${signalClass(fundamentalSignal)}`}>
                {fundamentalSignal}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>Portfolio Allocation</span>
          {starredStrategySummary?.hasUpdatedToday ? (
            <span className="signal-badge info">Updated Today</span>
          ) : (
            <span className="signal-badge stale">No Update Today</span>
          )}
        </h3>
        <div className="helper-text" style={{ marginBottom: 6 }}>
          Selected strategy: <strong>{starredStrategySummary?.displayName || 'Starred Strategy'}</strong>
        </div>
        <div className="helper-text" style={{ marginBottom: 10 }}>
          {starredStrategySummary?.description || 'No strategy description available.'}
        </div>
        {allocationRows.length > 0 ? (
          <div className="table-scroll">
            <table className="score-table allocation-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th style={{ textAlign: 'right' }}>Allocation</th>
                  <th style={{ textAlign: 'right' }}>Since</th>
                </tr>
              </thead>
              <tbody>
                {allocationRows.map((row) => (
                  <tr key={row.asset}>
                    <td style={{ fontWeight: 600 }}>{row.asset}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {row.weight.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {formatUtcDate(row.sinceTs) === todayUtcDate ? (
                        <span className="signal-badge info">Today</span>
                      ) : (
                        formatUtcDate(row.sinceTs)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="error-msg">No allocation data available for the starred strategy.</div>
        )}
      </div>

    </div>
  );
}
