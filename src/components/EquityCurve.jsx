import { useEffect, useRef } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export default function EquityCurve({ equity }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !equity || equity.length === 0) return;

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

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#58a6ff',
      lineWidth: 2,
    });

    const data = equity.map(e => ({
      time: e.time / 1000,
      value: e.value,
    }));

    lineSeries.setData(data);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [equity]);

  return <div ref={containerRef} className="chart-container" />;
}
