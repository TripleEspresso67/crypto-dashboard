import { useEffect, useRef, useCallback } from 'react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { DEFAULT_BACKTEST_START } from '../backtest/engine';

const LONG_COLOR = '#58a6ff';
const CASH_COLOR = '#e6edf3';
const NEUTRAL_COLOR = '#6e7681';

function buildChartData(candles, signals, backtestStart) {
  const chartData = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c.time < backtestStart) continue;
    const sig = signals ? signals[i] : 'NEUTRAL';
    const color = sig === 'LONG' ? LONG_COLOR : sig === 'CASH' ? CASH_COLOR : NEUTRAL_COLOR;
    chartData.push({
      time: c.time / 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      color,
      wickColor: color,
      borderColor: color,
    });
  }
  return chartData;
}

function buildMarkers(candles, signals, backtestStart) {
  if (!signals) return [];
  const markers = [];
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].time < backtestStart) continue;
    const prev = signals[i - 1];
    const curr = signals[i];
    if (prev !== 'LONG' && curr === 'LONG') {
      markers.push({
        time: candles[i].time / 1000,
        position: 'belowBar',
        color: LONG_COLOR,
        shape: 'arrowUp',
        text: 'LONG',
      });
    } else if (prev !== 'CASH' && curr === 'CASH') {
      markers.push({
        time: candles[i].time / 1000,
        position: 'aboveBar',
        color: CASH_COLOR,
        shape: 'arrowDown',
        text: 'CASH',
      });
    }
  }
  return markers;
}

export default function PriceChart({ candles, signals, backtestStart = DEFAULT_BACKTEST_START }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersRef = useRef(null);
  const prevBacktestStartRef = useRef(backtestStart);
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
      height: 400,
      timeScale: { timeVisible: false },
      crosshair: { mode: 0 },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: NEUTRAL_COLOR,
      downColor: NEUTRAL_COLOR,
      wickUpColor: NEUTRAL_COLOR,
      wickDownColor: NEUTRAL_COLOR,
      borderVisible: false,
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
      if (markersRef.current) {
        markersRef.current.detach();
        markersRef.current = null;
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !candles || candles.length === 0) return;

    const chartData = buildChartData(candles, signals, backtestStart);
    series.setData(chartData);

    if (markersRef.current) {
      markersRef.current.detach();
      markersRef.current = null;
    }
    const markers = buildMarkers(candles, signals, backtestStart);
    if (markers.length > 0) {
      markersRef.current = createSeriesMarkers(series, markers);
    }

    const backtestChanged = backtestStart !== prevBacktestStartRef.current;
    prevBacktestStartRef.current = backtestStart;

    if (!hasInitialFit.current || backtestChanged) {
      chart.timeScale().fitContent();
      hasInitialFit.current = true;
    }
  }, [candles, signals, backtestStart]);

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
        title="Reset chart view to full backtest window"
      >
        Reset View
      </button>
    </div>
  );
}
