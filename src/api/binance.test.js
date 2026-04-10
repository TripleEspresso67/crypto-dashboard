import { describe, expect, it } from 'vitest';
import { resample1dTo3d } from './binance.js';

function makeDaily(date, open, high, low, close, volume = 100) {
  const time = Date.parse(`${date}T00:00:00.000Z`);
  return {
    time,
    open,
    high,
    low,
    close,
    volume,
    closeTime: time + 86400000 - 1,
  };
}

describe('resample1dTo3d', () => {
  it('groups days in 3-day windows starting at Jan 1', () => {
    const daily = [
      makeDaily('2026-02-06', 10, 12, 9, 11, 1),
      makeDaily('2026-02-07', 11, 13, 10, 12, 2),
      makeDaily('2026-02-08', 12, 14, 11, 13, 3),
      makeDaily('2026-02-09', 13, 15, 12, 14, 4),
    ];

    const bars = resample1dTo3d(daily);
    expect(bars).toHaveLength(2);

    expect(bars[0]).toMatchObject({
      time: Date.parse('2026-02-06T00:00:00.000Z'),
      open: 10,
      high: 14,
      low: 9,
      close: 13,
      volume: 6,
      closeTime: Date.parse('2026-02-08T23:59:59.999Z'),
    });

    expect(bars[1]).toMatchObject({
      time: Date.parse('2026-02-09T00:00:00.000Z'),
      open: 13,
      high: 15,
      low: 12,
      close: 14,
      volume: 4,
      closeTime: Date.parse('2026-02-09T23:59:59.999Z'),
    });
  });

  it('resets 3-day grouping at year boundary', () => {
    const daily = [
      makeDaily('2022-12-30', 100, 103, 99, 101, 1),
      makeDaily('2022-12-31', 101, 104, 100, 102, 1),
      makeDaily('2023-01-01', 200, 205, 199, 204, 2),
      makeDaily('2023-01-02', 204, 207, 203, 206, 2),
      makeDaily('2023-01-03', 206, 208, 205, 207, 2),
    ];

    const bars = resample1dTo3d(daily);
    expect(bars).toHaveLength(2);

    expect(bars[0]).toMatchObject({
      time: Date.parse('2022-12-30T00:00:00.000Z'),
      open: 100,
      high: 104,
      low: 99,
      close: 102,
      volume: 2,
      closeTime: Date.parse('2022-12-31T23:59:59.999Z'),
    });

    expect(bars[1]).toMatchObject({
      time: Date.parse('2023-01-01T00:00:00.000Z'),
      open: 200,
      high: 208,
      low: 199,
      close: 207,
      volume: 6,
      closeTime: Date.parse('2023-01-03T23:59:59.999Z'),
    });
  });
});
