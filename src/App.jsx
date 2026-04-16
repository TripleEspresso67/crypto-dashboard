import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { fetchAllCandles, fetchLivePrices, getWarmupStart, ASSET_CONFIGS } from './api/binance';
import { runStrategy } from './strategies/scorer';
import { runBacktest } from './backtest/engine';
import { computeRatios } from './strategies/ratios';
import { MTTI_BTC_PARAMS } from './strategies/mttiBtcConfig';
import { MTTI_OTHERS_PARAMS } from './strategies/mttiOthersConfig';
import { LTTI_PARAMS } from './strategies/lttiConfig';
import ErrorBoundary from './components/ErrorBoundary';
import Overview from './components/Overview';
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
  const dailyCandlesRef = useRef({});

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
      dailyCandlesRef.current = dailyCandlesByAsset;
      setAssetData(results);
      setPaxgData(null);

      try {
        const paxgCandles = await fetchAllCandles('PAXGUSDT', '1d', getWarmupStart('1d'));
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
        } catch (_) { /* keep existing ratio data */ }
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

  const assetsTabData = useMemo(
    () => indexedAssetData.filter(a => !(a.config.strategy === 'LTTI' && (a.config.interval === '2d' || a.config.interval === '3d'))),
    [indexedAssetData]
  );

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
            <NavLink to="/" end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
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
            <NavLink to="/improvements" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
              Improvements
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
            path="/"
            element={
              <Overview
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
          <Route
            path="/improvements"
            element={
              <ImprovementsPage />
            }
          />
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
