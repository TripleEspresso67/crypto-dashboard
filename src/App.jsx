import { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
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

const STRATEGY_PARAMS = {
  'LTTI': LTTI_PARAMS,
  'MTTI-BTC': MTTI_BTC_PARAMS,
  'MTTI-others': MTTI_OTHERS_PARAMS,
};

const LIVE_POLL_MS = 10000;
const FULL_RELOAD_MS = 300000;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastLiveUpdate, setLastLiveUpdate] = useState(null);

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

  return (
    <div className="app">
      <div className="app-header">
        <div>
          <h1>Crypto Strategy Dashboard</h1>
          <span className="subtitle">LTTI &middot; MTTI-BTC &middot; MTTI-Others</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="subtitle">
            {assetData.length > 0 ? `${assetData.length} assets loaded` : ''}
          </span>
          {lastLiveUpdate && (
            <div className="live-indicator">
              <span className="live-dot" />
              LIVE &middot; {lastLiveUpdate.toLocaleTimeString()}
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
                assetData={assetData}
                ratioData={ratioData}
                loading={loading}
                error={error}
              />
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
                loading={loading}
              />
            }
          />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default App;
