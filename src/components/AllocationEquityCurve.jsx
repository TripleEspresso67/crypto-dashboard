import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export default function AllocationEquityCurve({ equity, barAllocations, assetNames, buyHoldEquity }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const bhSeriesRef = useRef(null);
  const hasInitialFit = useRef(false);
  const scoreBarRef = useRef(null);

  const equityRef = useRef(equity);
  const barAllocationsRef = useRef(barAllocations);
  const assetNamesRef = useRef(assetNames);
  const timeIndexMapRef = useRef(new Map());

  function updateAllocBar(barIndex) {
    if (!scoreBarRef.current) return;
    const allocs = barAllocationsRef.current;
    const names = assetNamesRef.current;
    if (!allocs || !names || barIndex === null || barIndex === undefined || barIndex < 0) {
      scoreBarRef.current.textContent = '';
      return;
    }
    const bar = allocs[barIndex];
    if (!bar) { scoreBarRef.current.textContent = ''; return; }
    const parts = names
      .map(name => {
        const pct = bar.weights[name] ?? 0;
        return `${name}: ${pct.toFixed(1)}%`;
      })
      .filter(p => p);
    scoreBarRef.current.textContent = parts.join('  ·  ');
  }

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
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#30363d' },
    });

    const bhSeries = chart.addSeries(LineSeries, {
      color: '#7B2D8E',
      lineWidth: 2,
    });

    const series = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 2,
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        const eq = equityRef.current;
        if (eq && eq.length > 0) updateAllocBar(eq.length - 1);
        return;
      }
      const idx = timeIndexMapRef.current.get(param.time);
      if (idx !== undefined) updateAllocBar(idx);
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
    equityRef.current = equity;
    barAllocationsRef.current = barAllocations;
    assetNamesRef.current = assetNames;

    timeIndexMapRef.current.clear();
    if (equity) {
      for (let i = 0; i < equity.length; i++) {
        timeIndexMapRef.current.set(equity[i].time / 1000, i);
      }
      updateAllocBar(equity.length - 1);
    }
  }, [equity, barAllocations, assetNames]);

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
          <span style={{ color: '#8b949e' }}>BTC Buy &amp; Hold</span>
        </span>
      </div>
      <div
        ref={scoreBarRef}
        style={{
          fontSize: '0.68rem',
          color: '#6e7681',
          padding: '4px 8px',
          minHeight: '1.4em',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      />
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
