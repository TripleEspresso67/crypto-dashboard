import { useEffect, useMemo, useState } from 'react';
import { formatUtcDate, formatUtcDateTime } from '../dateTime';

const FUNDAMENTALS_STORAGE_KEY = 'crypto-dashboard-fundamentals';
const ALLOCATION_SNAPSHOTS_STORAGE_KEY = 'crypto-dashboard-allocation-snapshots';
const REQUIRED_FUNDAMENTAL_IDS = ['avs_trend', 'iefp', 'sth_sopr', 'sth_pl_momentum'];
const STATUS_RESET_HOUR_UTC = 1;
const STATUS_UPDATE_HOUR_UTC = 21;
const STATUS_UPDATE_MINUTE_UTC = 45;

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

function loadAllocationSnapshots() {
  try {
    const raw = localStorage.getItem(ALLOCATION_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAllocationSnapshots(snapshots) {
  try {
    localStorage.setItem(ALLOCATION_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Ignore storage issues and keep in-memory behavior.
  }
}

function getDailyResetTimestamp(now) {
  const reset = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    STATUS_RESET_HOUR_UTC,
    0,
    0,
    0
  );
  if (now.getTime() >= reset) return reset;
  return reset - 24 * 60 * 60 * 1000;
}

function getDailyUpdateTimestamp(resetTs) {
  const resetDate = new Date(resetTs);
  return Date.UTC(
    resetDate.getUTCFullYear(),
    resetDate.getUTCMonth(),
    resetDate.getUTCDate(),
    STATUS_UPDATE_HOUR_UTC,
    STATUS_UPDATE_MINUTE_UTC,
    0,
    0
  );
}

function sanitizeAllocationRows(rows) {
  return (rows || [])
    .map((row) => {
      const asset = typeof row?.asset === 'string' ? row.asset : '';
      const weight = Number(row?.weight);
      const sinceTs = Number(row?.sinceTs);
      if (!asset || !Number.isFinite(weight) || !Number.isFinite(sinceTs)) return null;
      return { asset, weight, sinceTs };
    })
    .filter(Boolean);
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
  const [allocationSnapshots, setAllocationSnapshots] = useState(() => loadAllocationSnapshots());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const syncFundamentals = () => setFundamentalInputs(loadFundamentalInputs());
    syncFundamentals();
    window.addEventListener('fundamentals-updated', syncFundamentals);
    return () => window.removeEventListener('fundamentals-updated', syncFundamentals);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
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
  const snapshotFormulaKey = starredStrategySummary?.formula || 'default';
  const resetTs = useMemo(() => getDailyResetTimestamp(new Date(nowMs)), [nowMs]);
  const updateTs = useMemo(() => getDailyUpdateTimestamp(resetTs), [resetTs]);
  const cycleKey = useMemo(() => String(resetTs), [resetTs]);
  const todayUtcDate = formatUtcDate(nowMs);
  const formulaSnapshot = allocationSnapshots[snapshotFormulaKey];

  useEffect(() => {
    if (nowMs < updateTs) return;

    const sanitizedRows = sanitizeAllocationRows(allocationRows);
    if (sanitizedRows.length === 0) return;

    setAllocationSnapshots((prev) => {
      const existing = prev[snapshotFormulaKey];
      if (existing?.cycleKey === cycleKey) return prev;

      const next = {
        ...prev,
        [snapshotFormulaKey]: {
          cycleKey,
          rows: sanitizedRows,
          capturedAt: nowMs,
        },
      };
      saveAllocationSnapshots(next);
      return next;
    });
  }, [allocationRows, cycleKey, nowMs, snapshotFormulaKey, updateTs]);

  const displayedAllocationRows = useMemo(() => {
    if (formulaSnapshot?.cycleKey === cycleKey && Array.isArray(formulaSnapshot.rows) && formulaSnapshot.rows.length > 0) {
      return formulaSnapshot.rows;
    }
    if (nowMs < updateTs && Array.isArray(formulaSnapshot?.rows) && formulaSnapshot.rows.length > 0) {
      return formulaSnapshot.rows;
    }
    return allocationRows;
  }, [allocationRows, cycleKey, formulaSnapshot, nowMs, updateTs]);

  const allocationStatus = useMemo(() => {
    // Always default to "No Update Today" before the daily update checkpoint.
    if (nowMs < updateTs) return 'stale';

    const updatedSinceReset = displayedAllocationRows.some((row) => {
      const sinceTs = Number(row?.sinceTs);
      return Number.isFinite(sinceTs) && sinceTs >= resetTs;
    });

    return updatedSinceReset ? 'updated' : 'stale';
  }, [displayedAllocationRows, nowMs, resetTs, updateTs]);

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
          {allocationStatus === 'updated' ? (
            <span className="signal-badge info">Updated Today</span>
          ) : (
            <span className="signal-badge stale">No Update Today</span>
          )}
          <span className="helper-text">
            (Resets to No Update Today at 01:00 UTC; updates at 21:45 UTC)
          </span>
        </h3>
        <div className="helper-text" style={{ marginBottom: 6 }}>
          Selected strategy: <strong>{starredStrategySummary?.displayName || 'Starred Strategy'}</strong>
        </div>
        <div className="helper-text" style={{ marginBottom: 10 }}>
          {starredStrategySummary?.description || 'No strategy description available.'}
        </div>
        {displayedAllocationRows.length > 0 ? (
          <>
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
                  {displayedAllocationRows.map((row) => (
                    <tr key={row.asset}>
                      <td style={{ fontWeight: 600 }}>{row.asset}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {row.weight.toFixed(1)}%
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {formatUtcDate(row.sinceTs) === todayUtcDate ? (
                          <span className="signal-badge info">TODAY</span>
                        ) : (
                          `${formatUtcDateTime(row.sinceTs)} UTC`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="helper-text" style={{ marginTop: 8 }}>
              Note: the Portfolio Allocation table now updates on a scheduled daily snapshot at 21:45 UTC.
            </div>
            <div className="helper-text" style={{ marginTop: 4 }}>
              Since column logic: show <strong>TODAY</strong> when the date matches the current UTC date; otherwise show UTC date and time.
            </div>
          </>
        ) : (
          <div className="error-msg">No allocation data available for the starred strategy.</div>
        )}
      </div>

    </div>
  );
}
