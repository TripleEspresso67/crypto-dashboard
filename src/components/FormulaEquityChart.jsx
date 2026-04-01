import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export const FORMULA_COLORS = {
  A: '#ffffff',
  B: '#58a6ff',
  C: '#7ee787',
  D: '#d2a8ff',
  E: '#ffa657',
  F: '#ff7b72',
  G: '#79c0ff',
  H: '#e3b341',
  I: '#56d364',
  J: '#f78166',
  K: '#a5d6ff',
  L: '#b392f0',
  M: '#6ee7b7',
  N: '#ffd166',
};

const BH_COLOR = '#7B2D8E';

export default function FormulaEquityChart({ formulaEquities, buyHoldEquity }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesMapRef = useRef({});
  const hasInitialFit = useRef(false);

  const resetView = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#1c2128' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#30363d' },
        horzLines: { color: '#30363d' },
      },
      width: containerRef.current.clientWidth,
      height: 350,
      timeScale: { timeVisible: false },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#30363d' },
    });

    chartRef.current = chart;
    hasInitialFit.current = false;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesMapRef.current = {};
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !formulaEquities) return;

    for (const key of Object.keys(seriesMapRef.current)) {
      try { chart.removeSeries(seriesMapRef.current[key]); } catch (_) { /* already removed */ }
    }
    seriesMapRef.current = {};

    const hasStrategyA = Object.prototype.hasOwnProperty.call(formulaEquities, 'A');
    if (!hasStrategyA) {
      const bhSeries = chart.addSeries(LineSeries, {
        color: BH_COLOR,
        lineWidth: 2,
        title: 'BH',
      });
      if (buyHoldEquity && buyHoldEquity.length > 0) {
        bhSeries.setData(buyHoldEquity.map(e => ({ time: e.time / 1000, value: e.value })));
      }
      seriesMapRef.current.BH = bhSeries;
    }

    const formulaKeys = Object.keys(formulaEquities);
    for (const key of formulaKeys) {
      const eq = formulaEquities[key];
      if (!eq || eq.length === 0) continue;
      const series = chart.addSeries(LineSeries, {
        color: FORMULA_COLORS[key] || '#8b949e',
        lineWidth: 2,
        title: key,
      });
      series.setData(eq.map(e => ({ time: e.time / 1000, value: e.value })));
      seriesMapRef.current[key] = series;
    }

    if (!hasInitialFit.current) {
      chart.timeScale().fitContent();
      hasInitialFit.current = true;
    }
  }, [formulaEquities, buyHoldEquity]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onDblClick = () => chartRef.current?.timeScale().fitContent();
    container.addEventListener('dblclick', onDblClick);
    return () => container.removeEventListener('dblclick', onDblClick);
  }, []);

  const legendKeys = Object.keys(formulaEquities || {});
  const hasStrategyA = legendKeys.includes('A');

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} className="chart-container" />
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
        padding: '6px 0 0 8px', fontSize: '0.72rem',
      }}>
        {legendKeys.map(key => (
          <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 14, height: 3,
              background: FORMULA_COLORS[key] || '#8b949e', borderRadius: 1,
            }} />
            <span style={{ color: '#8b949e' }}>{key}</span>
          </span>
        ))}
        {!hasStrategyA && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 14, height: 3,
              background: BH_COLOR, borderRadius: 1,
            }} />
            <span style={{ color: '#8b949e' }}>BTC B&amp;H</span>
          </span>
        )}
      </div>
      <button
        onClick={resetView}
        className="reset-view-btn"
        title="Reset chart view"
      >
        Reset View
      </button>
    </div>
  );
}
