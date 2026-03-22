import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export default function EquityCurve({ equity, buyHoldEquity }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bhSeriesRef = useRef(null);
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
      height: 300,
      timeScale: { timeVisible: false },
      rightPriceScale: {
        borderColor: '#30363d',
      },
    });

    const bhSeries = chart.addSeries(LineSeries, {
      color: '#7B2D8E',
      lineWidth: 2,
    });

    const series = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    bhSeriesRef.current = bhSeries;
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
      seriesRef.current = null;
      bhSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !equity || equity.length === 0) return;

    const data = equity.map(e => ({
      time: e.time / 1000,
      value: e.value,
    }));

    series.setData(data);

    if (!hasInitialFit.current) {
      chart.timeScale().fitContent();
      hasInitialFit.current = true;
    }
  }, [equity]);

  useEffect(() => {
    const bhSeries = bhSeriesRef.current;
    if (!bhSeries || !buyHoldEquity || buyHoldEquity.length === 0) return;

    const data = buyHoldEquity.map(e => ({
      time: e.time / 1000,
      value: e.value,
    }));

    bhSeries.setData(data);
  }, [buyHoldEquity]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onDblClick = () => {
      chartRef.current?.timeScale().fitContent();
    };
    container.addEventListener('dblclick', onDblClick);
    return () => container.removeEventListener('dblclick', onDblClick);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={containerRef} className="chart-container" />
      <div style={{ display: 'flex', gap: 16, padding: '6px 0 0 8px', fontSize: '0.75rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 3, background: '#58a6ff', borderRadius: 1 }} />
          <span style={{ color: '#8b949e' }}>Strategy</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ display: 'inline-block', width: 14, height: 3, background: '#7B2D8E', borderRadius: 1 }} />
          <span style={{ color: '#8b949e' }}>Buy &amp; Hold</span>
        </span>
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
