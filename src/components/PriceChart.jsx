import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { DEFAULT_BACKTEST_START } from '../backtest/engine';

const LONG_COLOR = '#58a6ff';
const CASH_COLOR = '#e6edf3';
const NEUTRAL_COLOR = '#6e7681';

export default function PriceChart({ candles, signals, backtestStart = DEFAULT_BACKTEST_START }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !candles || candles.length === 0) return;

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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: NEUTRAL_COLOR,
      downColor: NEUTRAL_COLOR,
      wickUpColor: NEUTRAL_COLOR,
      wickDownColor: NEUTRAL_COLOR,
      borderVisible: false,
    });

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

    candleSeries.setData(chartData);

    let markersInstance = null;
    if (signals) {
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
      if (markers.length > 0) {
        markersInstance = createSeriesMarkers(candleSeries, markers);
      }
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (markersInstance) markersInstance.detach();
      chart.remove();
    };
  }, [candles, signals, backtestStart]);

  return <div ref={containerRef} className="chart-container" />;
}
