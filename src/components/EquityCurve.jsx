import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export default function EquityCurve({ equity }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
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

    const series = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = series;
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
