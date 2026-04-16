import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FundamentalsPanel from './FundamentalsPanel';
import { formatUtcDate } from '../dateTime';

const FUNDAMENTALS_STORAGE_KEY = 'crypto-dashboard-fundamentals';
const REQUIRED_FUNDAMENTAL_IDS = ['iefp', 'sth_sopr', 'sth_pl_momentum'];
const FUNDAMENTAL_MISSING_MSG = 'Fundamental Indicators need to be scored for calculation';

function formatPrice(p) {
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function scoreClass(s) {
  if (s > 0) return 'positive';
  if (s < 0) return 'negative';
  return 'zero';
}

function getAssetLastScore(asset) {
  if (!asset?.compositeScores?.length) return null;
  const v = asset.compositeScores[asset.compositeScores.length - 1];
  return Number.isFinite(v) ? v : null;
}

function getAssetSignal(asset) {
  if (!asset?.signals?.length) return null;
  return asset.signals[asset.signals.length - 1];
}

function getIndicatorCurrent(indicatorResult, candles) {
  if (!indicatorResult || !candles?.length) return null;
  const idx = candles.length - 1;
  const v = indicatorResult.scores?.[idx];
  return Number.isFinite(v) ? v : null;
}

function getIndicatorLastChanged(indicatorResult, candles) {
  if (!indicatorResult || !candles?.length) return null;
  const idx = candles.length - 1;
  const ts = indicatorResult.lastChanged?.[idx];
  return Number.isFinite(ts) ? ts : null;
}

function formatScore(v) {
  return v === null ? '--' : v.toFixed(2);
}

const TECH_CARD_ORDER = ['2d', '3d'];

export default function MarketPage({ ltti2dAsset, ltti3dAsset, loading, error }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [fundamentalsInputs, setFundamentalsInputs] = useState({});

  useEffect(() => {
    const loadFundamentals = () => {
      try {
        const raw = localStorage.getItem(FUNDAMENTALS_STORAGE_KEY);
        setFundamentalsInputs(raw ? JSON.parse(raw) : {});
      } catch {
        setFundamentalsInputs({});
      }
    };
    loadFundamentals();
    window.addEventListener('fundamentals-updated', loadFundamentals);
    return () => window.removeEventListener('fundamentals-updated', loadFundamentals);
  }, []);

  const last2dCandle = ltti2dAsset?.candles?.[ltti2dAsset.candles.length - 1];
  const last3dCandle = ltti3dAsset?.candles?.[ltti3dAsset.candles.length - 1];
  const technical2d = getAssetLastScore(ltti2dAsset);
  const technical3d = getAssetLastScore(ltti3dAsset);
  const signal2d = getAssetSignal(ltti2dAsset);
  const signal3d = getAssetSignal(ltti3dAsset);

  const fundamentalsReady = useMemo(
    () => REQUIRED_FUNDAMENTAL_IDS.every(id => fundamentalsInputs[id] !== undefined && fundamentalsInputs[id] !== ''),
    [fundamentalsInputs]
  );

  const fundamentalAggregate = useMemo(() => {
    if (!fundamentalsReady) return null;
    const values = REQUIRED_FUNDAMENTAL_IDS
      .map(id => parseInt(fundamentalsInputs[id], 10))
      .filter(Number.isFinite);
    if (values.length !== REQUIRED_FUNDAMENTAL_IDS.length) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [fundamentalsInputs, fundamentalsReady]);

  const fundamentalIndicatorValues = useMemo(() => {
    if (!fundamentalsReady) return null;
    const values = REQUIRED_FUNDAMENTAL_IDS
      .map(id => parseInt(fundamentalsInputs[id], 10))
      .filter(Number.isFinite);
    if (values.length !== REQUIRED_FUNDAMENTAL_IDS.length) return null;
    return values;
  }, [fundamentalsInputs, fundamentalsReady]);

  const technicalIndicatorValues2d = useMemo(() => {
    if (!ltti2dAsset?.indicatorResults || !ltti2dAsset?.candles?.length) return [];
    const scores = ltti2dAsset.indicatorResults
      .map(r => getIndicatorCurrent(r, ltti2dAsset.candles))
      .filter(v => v !== null);
    return scores;
  }, [ltti2dAsset]);

  const technicalIndicatorValues3d = useMemo(() => {
    if (!ltti3dAsset?.indicatorResults || !ltti3dAsset?.candles?.length) return [];
    const scores = ltti3dAsset.indicatorResults
      .map(r => getIndicatorCurrent(r, ltti3dAsset.candles))
      .filter(v => v !== null);
    return scores;
  }, [ltti3dAsset]);

  const technicalOverall = useMemo(() => {
    const vals = [technical2d, technical3d].filter(v => v !== null);
    if (vals.length === 0) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }, [technical2d, technical3d]);

  const fundamentalPlusTechnical2d = useMemo(() => {
    if (!fundamentalIndicatorValues || technicalIndicatorValues2d.length === 0) return null;
    const all = [...fundamentalIndicatorValues, ...technicalIndicatorValues2d];
    return all.reduce((sum, v) => sum + v, 0) / all.length;
  }, [fundamentalIndicatorValues, technicalIndicatorValues2d]);

  const fundamentalPlusTechnical3d = useMemo(() => {
    if (!fundamentalIndicatorValues || technicalIndicatorValues3d.length === 0) return null;
    const all = [...fundamentalIndicatorValues, ...technicalIndicatorValues3d];
    return all.reduce((sum, v) => sum + v, 0) / all.length;
  }, [fundamentalIndicatorValues, technicalIndicatorValues3d]);

  const fundamentalPlusTechnicalOverall = useMemo(() => {
    if (!fundamentalIndicatorValues) return null;
    const technicalAll = [...technicalIndicatorValues2d, ...technicalIndicatorValues3d];
    if (technicalAll.length === 0) return null;
    const all = [...fundamentalIndicatorValues, ...technicalAll];
    return all.reduce((sum, v) => sum + v, 0) / all.length;
  }, [fundamentalIndicatorValues, technicalIndicatorValues2d, technicalIndicatorValues3d]);

  const indicatorRows = useMemo(() => {
    const order = ltti3dAsset?.indicatorResults?.map(r => r.key) || ltti2dAsset?.indicatorResults?.map(r => r.key) || [];
    const byKey2d = Object.fromEntries((ltti2dAsset?.indicatorResults || []).map(r => [r.key, r]));
    const byKey3d = Object.fromEntries((ltti3dAsset?.indicatorResults || []).map(r => [r.key, r]));

    return order.map((key) => {
      const r2 = byKey2d[key] || null;
      const r3 = byKey3d[key] || null;
      return {
        key,
        name: r3?.name || r2?.name || key,
        score2d: getIndicatorCurrent(r2, ltti2dAsset?.candles),
        score3d: getIndicatorCurrent(r3, ltti3dAsset?.candles),
        lastChange2d: getIndicatorLastChanged(r2, ltti2dAsset?.candles),
        lastChange3d: getIndicatorLastChanged(r3, ltti3dAsset?.candles),
      };
    });
  }, [ltti2dAsset, ltti3dAsset]);

  const technicalCards = useMemo(() => {
    const cards = {
      '3d': {
        asset: ltti3dAsset,
        candle: last3dCandle,
        score: technical3d,
        signal: signal3d,
      },
      '2d': {
        asset: ltti2dAsset,
        candle: last2dCandle,
        score: technical2d,
        signal: signal2d,
      },
    };
    return TECH_CARD_ORDER.map((key) => cards[key]).filter(c => c.asset && c.candle);
  }, [ltti2dAsset, ltti3dAsset, last2dCandle, last3dCandle, technical2d, technical3d, signal2d, signal3d]);

  if (error) {
    return <div className="error-msg">{error}</div>;
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading market data...</p>
      </div>
    );
  }

  return (
    <div>
      <FundamentalsPanel />

      <div className="section">
        <h3 className="section-title">Technical Indicators</h3>
        {ltti2dAsset || ltti3dAsset ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
              {technicalCards.map(({ asset, candle, score, signal }) => (
                <div
                  key={asset.config.label}
                  className="asset-card"
                  onClick={() => navigate(`/asset/${asset.sourceIndex}`, { state: { from: location.pathname } })}
                >
                  <div className="card-header">
                    <span className="asset-name">{asset.config.label}</span>
                    <span className="strategy-badge">{asset.config.strategy} {asset.config.interval.toUpperCase()}</span>
                  </div>
                  <div className="price">{formatPrice(candle.close)}</div>
                  <div className="score-row">
                    <span className="composite-score">Score: {formatScore(score)}</span>
                    {signal ? (
                      <span className={`signal-badge ${signal.toLowerCase()}`}>{signal}</span>
                    ) : (
                      <span className="signal-badge neutral">--</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12 }} className="table-scroll">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th style={{ textAlign: 'center' }}>2D Score</th>
                    <th style={{ textAlign: 'center' }}>3D Score</th>
                    <th style={{ textAlign: 'right' }}>2D Last Change (UTC)</th>
                    <th style={{ textAlign: 'right' }}>3D Last Change (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.score2d === null ? '--' : (
                          <span className={`score-cell ${scoreClass(row.score2d)}`}>
                            {row.score2d > 0 ? '+1' : row.score2d < 0 ? '-1' : '0'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.score3d === null ? '--' : (
                          <span className={`score-cell ${scoreClass(row.score3d)}`}>
                            {row.score3d > 0 ? '+1' : row.score3d < 0 ? '-1' : '0'}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatUtcDate(row.lastChange2d)} UTC</td>
                      <td style={{ textAlign: 'right' }}>{formatUtcDate(row.lastChange3d)} UTC</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="error-msg">BTC LTTI assets are not available.</div>
        )}
      </div>

      <div className="section">
        <h3 className="section-title">Long-term Trend Indicator</h3>
        {ltti2dAsset || ltti3dAsset ? (
          <div style={{ marginTop: 16 }} className="table-scroll">
              <table className="score-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th style={{ textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Fundamental Indicator Aggregate</td>
                    <td style={{ textAlign: 'right' }}>
                      {fundamentalAggregate !== null ? fundamentalAggregate.toFixed(2) : FUNDAMENTAL_MISSING_MSG}
                    </td>
                  </tr>
                  <tr>
                    <td>Technical Indicator (2D) Aggregate</td>
                    <td style={{ textAlign: 'right' }}>{formatScore(technical2d)}</td>
                  </tr>
                  <tr>
                    <td>Technical Indicator (3D) Aggregate</td>
                    <td style={{ textAlign: 'right' }}>{formatScore(technical3d)}</td>
                  </tr>
                  <tr>
                    <td>Technical Indicator Overall Aggregate</td>
                    <td style={{ textAlign: 'right' }}>{formatScore(technicalOverall)}</td>
                  </tr>
                  <tr>
                    <td>Fundamental + Technical Indicator (2D) Score</td>
                    <td style={{ textAlign: 'right' }}>
                      {fundamentalPlusTechnical2d !== null ? fundamentalPlusTechnical2d.toFixed(2) : FUNDAMENTAL_MISSING_MSG}
                    </td>
                  </tr>
                  <tr>
                    <td>Fundamental + Technical Indicator (3D) Score</td>
                    <td style={{ textAlign: 'right' }}>
                      {fundamentalPlusTechnical3d !== null ? fundamentalPlusTechnical3d.toFixed(2) : FUNDAMENTAL_MISSING_MSG}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Fundamental + Technical Indicator Overall Score</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {fundamentalPlusTechnicalOverall !== null ? fundamentalPlusTechnicalOverall.toFixed(2) : FUNDAMENTAL_MISSING_MSG}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
        ) : (
          <div className="error-msg">BTC LTTI assets are not available.</div>
        )}
      </div>
    </div>
  );
}
