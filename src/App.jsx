import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { fetchAllCandles, fetchLivePrices, getWarmupStart, ASSET_CONFIGS } from './api/binance';
import { runStrategy } from './strategies/scorer';
import { runBacktest } from './backtest/engine';
import { computeRatios } from './strategies/ratios';
import { runAllocationAnalysis } from './backtest/allocationBacktest';
import { MTTI_BTC_PARAMS } from './strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from './strategies/mttiOthersConfig';
import { LTTI_PARAMS } from './strategies/lttiConfig';
import ErrorBoundary from './components/ErrorBoundary';
import AssetsOverview from './components/Overview';
import DashboardOverview from './components/DashboardOverview';
import AssetDetail from './components/AssetDetail';
import RatioDetail from './components/RatioDetail';
import FormulaDetail from './components/FormulaDetail';
import RatiosTable from './components/RatiosTable';
import AllocationSection from './components/AllocationSection';
import MarketPage from './components/MarketPage';
import ImprovementsPage from './components/ImprovementsPage';
import { formatUtcTime } from './dateTime';

const STRATEGY_PARAMS = {
  'LTTI': LTTI_PARAMS,
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

const LIVE_POLL_MS = 10000;
const FULL_RELOAD_MS = 1200000;
const DASHBOARD_REFRESH_EVENT = 'dashboard-refresh';

function applyLivePrice(candles, livePrice) {
  if (!candles || candles.length === 0 || !livePrice) return candles;
  const updated = candles.slice();
  const last = { ...updated[updated.length - 1] };
  last.close = livePrice;
  last.high = Math.max(last.high, livePrice);
  last.low = Math.min(last.low, livePrice);
  updated[updated.length - 1] = last;
  return updated;
}

function App() {
  const [assetData, setAssetData] = useState([]);
  const [ratioData, setRatioData] = useState(null);
  const [paxgData, setPaxgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const baseDataRef = useRef([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = [];
      const dailyCandlesByAsset = {};

      for (const config of ASSET_CONFIGS) {
        try {
          const warmupStart = getWarmupStart(config.interval);
          const candles = await fetchAllCandles(config.symbol, config.interval, warmupStart);

          if (candles.length === 0) {
            console.warn(`No data for ${config.symbol}`);
            continue;
          }

          const stratParams = STRATEGY_PARAMS[config.strategy];
          const { indicatorResults, compositeScores, signals } = runStrategy(candles, stratParams);
          const backtest = runBacktest(candles, compositeScores, stratParams.longThresh, stratParams.shortThresh);

          results.push({
            config,
            candles,
            indicatorResults,
            compositeScores,
            signals,
            backtest,
          });

          if (config.interval === '1d') {
            dailyCandlesByAsset[config.name] = candles;
          }
        } catch (assetErr) {
          console.warn(`Failed to load ${config.symbol} (${config.strategy}): ${assetErr.message}`);
        }
      }

      baseDataRef.current = results;
      setAssetData(results);
      setPaxgData(null);

      try {
        const paxgCandles = await fetchAllCandles('PAXGUSDT', '1d', getWarmupStart());
        if (paxgCandles.length > 0) {
          setPaxgData({
            config: { symbol: 'PAXGUSDT', name: 'PAXG', interval: '1d', strategy: 'MTTI-others', label: 'PAXG (Allocation only)' },
            candles: paxgCandles,
          });
        } else {
          console.warn('No data for PAXGUSDT (allocation only)');
        }
      } catch (paxgErr) {
        console.warn(`Failed to load PAXGUSDT (allocation only): ${paxgErr.message}`);
      }

      try {
        const ratios = computeRatios(dailyCandlesByAsset);
        setRatioData(ratios);
      } catch (ratioErr) {
        console.warn('Ratio computation failed:', ratioErr.message);
      }
    } catch (err) {
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLivePrices = useCallback(async () => {
    if (baseDataRef.current.length === 0) return;

    try {
      const prices = await fetchLivePrices();
      if (Object.keys(prices).length === 0) return;

      const updatedResults = baseDataRef.current.map(asset => {
        const livePrice = prices[asset.config.symbol];
        if (!livePrice) return asset;

        const updatedCandles = applyLivePrice(asset.candles, livePrice);
        const stratParams = STRATEGY_PARAMS[asset.config.strategy];
        const { indicatorResults, compositeScores, signals } = runStrategy(updatedCandles, stratParams);

        return {
          ...asset,
          candles: updatedCandles,
          indicatorResults,
          compositeScores,
          signals,
        };
      });

      setAssetData(updatedResults);
      baseDataRef.current = updatedResults;
      setLastLiveUpdate(new Date());

      const updatedDaily = {};
      for (const asset of updatedResults) {
        if (asset.config.interval === '1d') {
          updatedDaily[asset.config.name] = asset.candles;
        }
      }
      if (Object.keys(updatedDaily).length > 1) {
        try {
          const ratios = computeRatios(updatedDaily);
          setRatioData(ratios);
        } catch {
          /* keep existing ratio data */
        }
      }
    } catch (err) {
      console.warn('Live price update failed:', err.message);
    }
  }, []);

  useEffect(() => {
    loadData();
    const fullReload = setInterval(loadData, FULL_RELOAD_MS);
    return () => clearInterval(fullReload);
  }, [loadData]);

  useEffect(() => {
    if (loading) return;
    const livePoll = setInterval(updateLivePrices, LIVE_POLL_MS);
    return () => clearInterval(livePoll);
  }, [loading, updateLivePrices]);

  const indexedAssetData = useMemo(
    () => assetData.map((asset, idx) => ({ ...asset, sourceIndex: idx })),
    [assetData]
  );

  const ltti2dAsset = useMemo(
    () => indexedAssetData.find(a => a.config.strategy === 'LTTI' && a.config.interval === '2d') || null,
    [indexedAssetData]
  );

  const ltti3dAsset = useMemo(
    () => indexedAssetData.find(a => a.config.strategy === 'LTTI' && a.config.interval === '3d') || null,
    [indexedAssetData]
  );

  const mttiBtc1dAsset = useMemo(
    () => indexedAssetData.find(a => a.config.strategy === 'MTTI-BTC' && a.config.interval === '1d') || null,
    [indexedAssetData]
  );

  const assetsTabData = useMemo(
    () => indexedAssetData.filter(a => !(a.config.strategy === 'LTTI' && (a.config.interval === '2d' || a.config.interval === '3d'))),
    [indexedAssetData]
  );

  const favoriteStrategyFormula = (() => {
    try {
      return localStorage.getItem('favoriteAllocationStrategy') || 'U';
    } catch {
      return 'U';
    }
  })();

  const starredStrategySummary = useMemo(() => {
    if (!indexedAssetData.length || !ratioData?.dominance) return null;
    const mttiAssets = indexedAssetData.filter(a => a.config.strategy !== 'LTTI');
    if (mttiAssets.length === 0) return null;

    const allocationAnalysis = runAllocationAnalysis(
      mttiAssets,
      ratioData.dominance,
      ratioData.pairs,
      undefined,
      ltti3dAsset,
      paxgData,
      ltti2dAsset
    );

    if (!allocationAnalysis) return null;

    const comparisonRow = allocationAnalysis.comparison.find(row => row.formula === favoriteStrategyFormula);
    const formulaDetails = allocationAnalysis.formulaDetails?.[favoriteStrategyFormula];
    const barAllocations = formulaDetails?.barAllocations || [];
    const latestAllocation = barAllocations[barAllocations.length - 1]?.weights || {};
    const previousAllocation = barAllocations[barAllocations.length - 2]?.weights || {};
    const changeThresholdPct = 0.01;

    const totalWeightFromMap = (weightsMap) => Object.values(weightsMap || {})
      .reduce((sum, value) => sum + (Number.isFinite(value) ? Number(value) : 0), 0);

    const getWeightAtBar = (bar, asset) => {
      if (!bar?.weights) return 0;
      if (asset === 'CASH') return Math.max(0, 100 - totalWeightFromMap(bar.weights));
      const value = Number(bar.weights[asset] || 0);
      return Number.isFinite(value) ? value : 0;
    };

    const getSinceTimestamp = (asset, currentWeight) => {
      if (barAllocations.length === 0) return null;
      let sinceTs = barAllocations[barAllocations.length - 1]?.time ?? null;
      for (let i = barAllocations.length - 2; i >= 0; i--) {
        const priorWeight = getWeightAtBar(barAllocations[i], asset);
        if (Math.abs(priorWeight - currentWeight) > changeThresholdPct) {
          return sinceTs;
        }
        sinceTs = barAllocations[i]?.time ?? sinceTs;
      }
      return sinceTs;
    };

    const allocations = Object.entries(latestAllocation)
      .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
      .map(([asset, weight]) => {
        const currentWeight = Number(weight);
        const previousWeight = Number(previousAllocation[asset] || 0);
        return {
          asset,
          weight: currentWeight,
          updated: Math.abs(currentWeight - previousWeight) > changeThresholdPct,
          sinceTs: getSinceTimestamp(asset, currentWeight),
        };
      })
      .sort((a, b) => b.weight - a.weight);

    const totalAllocated = allocations.reduce((sum, row) => sum + row.weight, 0);
    const cashWeight = Math.max(0, Number((100 - totalAllocated).toFixed(2)));
    const previousAllocated = totalWeightFromMap(previousAllocation);
    const previousCashWeight = Math.max(0, Number((100 - previousAllocated).toFixed(2)));
    if (cashWeight > 0.01) {
      allocations.push({
        asset: 'CASH',
        weight: cashWeight,
        updated: Math.abs(cashWeight - previousCashWeight) > changeThresholdPct,
        sinceTs: getSinceTimestamp('CASH', cashWeight),
      });
    }

    const hasUpdatedToday = allocations.some(row => row.updated);

    return {
      formula: favoriteStrategyFormula,
      displayName: comparisonRow?.displayFormula || favoriteStrategyFormula,
      description: comparisonRow?.label || '',
      allocations,
      hasUpdatedToday,
    };
  }, [favoriteStrategyFormula, indexedAssetData, ratioData, ltti3dAsset, paxgData, ltti2dAsset]);

  const refreshDashboard = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await loadData();
      await updateLivePrices();
      window.dispatchEvent(new Event(DASHBOARD_REFRESH_EVENT));
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadData, updateLivePrices]);

  return (
    <div className="app">
      <div className="app-header">
        <div>
          <h1>Crypto Dashboard</h1>
          <span className="subtitle">LTTI &middot; MTTI-BTC &middot; MTTI-Others</span>
          <div className="app-nav" role="navigation" aria-label="Primary dashboard sections">
            <NavLink to="/overview" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Overview
            </NavLink>
            <NavLink to="/assets" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Assets
            </NavLink>
            <NavLink to="/ratios" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Ratios
            </NavLink>
            <NavLink to="/market" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Market
            </NavLink>
            <NavLink to="/allocation" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Allocation
            </NavLink>
            <NavLink to="/notes" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Notes
            </NavLink>
          </div>
        </div>
        <div className="app-header-actions">
          <span className="subtitle">
            {assetData.length > 0 ? `${assetData.length} assets loaded` : ''}
          </span>
          <button
            type="button"
            className="refresh-button"
            onClick={refreshDashboard}
            disabled={loading || isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          {lastLiveUpdate && (
            <div className="live-indicator">
              <span className="live-dot" />
              LIVE &middot; {formatUtcTime(lastLiveUpdate)} UTC
            </div>
          )}
        </div>
      </div>

      <ErrorBoundary>
        <Routes>
          <Route
            path="/overview"
            element={
              <DashboardOverview
                loading={loading}
                error={error}
                mttiBtc1d={mttiBtc1dAsset}
                ltti3d={ltti3dAsset}
                starredStrategySummary={starredStrategySummary}
              />
            }
          />
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route
            path="/assets"
            element={
              <AssetsOverview
                assetData={assetsTabData}
                loading={loading}
                error={error}
              />
            }
          />
          <Route
            path="/ratios"
            element={
              error ? (
                <div className="error-msg">{error}</div>
              ) : loading ? (
                <div className="loading">
                  <div className="spinner" />
                  <p>Computing all pair ratios...</p>
                </div>
              ) : ratioData?.pairs?.length > 0 ? (
                <RatiosTable ratioData={ratioData} />
              ) : (
                <div className="error-msg">No ratio data available.</div>
              )
            }
          />
          <Route
            path="/allocation"
            element={
              error ? (
                <div className="error-msg">{error}</div>
              ) : loading ? (
                <div className="loading">
                  <div className="spinner" />
                  <p>Loading allocation strategies...</p>
                </div>
              ) : (
                <AllocationSection assetData={assetData} ratioData={ratioData} paxgData={paxgData} />
              )
            }
          />
          <Route
            path="/market"
            element={
              <MarketPage
                ltti2dAsset={ltti2dAsset}
                ltti3dAsset={ltti3dAsset}
                loading={loading}
                error={error}
              />
            }
          />
          <Route path="/notes" element={<ImprovementsPage />} />
          <Route path="/improvements" element={<Navigate to="/notes" replace />} />
          <Route
            path="/asset/:id"
            element={<AssetDetail assetData={assetData} loading={loading} />}
          />
          <Route
            path="/ratio/:id"
            element={<RatioDetail ratioData={ratioData} loading={loading} />}
          />
          <Route
            path="/formula/:key"
            element={
              <FormulaDetail
                assetData={assetData}
                ratioData={ratioData}
                paxgData={paxgData}
                loading={loading}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default App;
