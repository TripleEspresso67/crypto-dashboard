import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';
import { FORMULA_COLORS } from './formulaColors';

const getChartHeight = () => {
  const viewport = window.innerHeight || 800;
  return Math.max(240, Math.min(380, Math.floor(viewport * 0.42)));
};

export default function FormulaEquityChart({ formulaEquities, formulaDisplayMap = {} }) {
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
      height: getChartHeight(),
      timeScale: { timeVisible: false },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#30363d' },
    });

    chartRef.current = chart;
    hasInitialFit.current = false;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: getChartHeight(),
        });
      }
    };
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
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
      try {
        chart.removeSeries(seriesMapRef.current[key]);
      } catch {
        /* already removed */
      }
    }
    seriesMapRef.current = {};

    const formulaKeys = Object.keys(formulaEquities);
    for (const key of formulaKeys) {
      const eq = formulaEquities[key];
      if (!eq || eq.length === 0) continue;
      const series = chart.addSeries(LineSeries, {
        color: FORMULA_COLORS[key] || '#8b949e',
        lineWidth: 2,
        title: formulaDisplayMap[key] || key,
      });
      series.setData(eq.map(e => ({ time: e.time / 1000, value: e.value })));
      seriesMapRef.current[key] = series;
    }

    if (!hasInitialFit.current) {
      chart.timeScale().fitContent();
      hasInitialFit.current = true;
    }
  }, [formulaDisplayMap, formulaEquities]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onDblClick = () => chartRef.current?.timeScale().fitContent();
    container.addEventListener('dblclick', onDblClick);
    return () => container.removeEventListener('dblclick', onDblClick);
  }, []);

  const legendKeys = Object.keys(formulaEquities || {});
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
            <span style={{ color: '#8b949e' }}>{formulaDisplayMap[key] || key}</span>
          </span>
        ))}
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
