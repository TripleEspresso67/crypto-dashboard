export const DEFAULT_BACKTEST_START_DATE = '2023-01-01';
export const DEFAULT_BACKTEST_START = new Date(`${DEFAULT_BACKTEST_START_DATE}T00:00:00Z`).getTime();

export const BACKTEST_DATE_PRESETS = [
  { label: '1 Jan 2023', value: '2023-01-01' },
  { label: '22 Jan 2024', value: '2024-01-22' },
  { label: '14 Mar 2024', value: '2024-03-14' },
  { label: '25 Sep 2024', value: '2024-09-25' },
  { label: '7 Apr 2025', value: '2025-04-07' },
  { label: 'Custom', value: 'custom' },
];
