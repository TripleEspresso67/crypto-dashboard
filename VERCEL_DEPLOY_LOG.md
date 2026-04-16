# Vercel Deploy Log

Tracks changes that were pushed to GitHub and deployed to Vercel.

## 2026-04-13

- **Commit:** `d2a8a63`
- **Branch:** `master`
- **Summary of deployed changes:**
  - Standardized dashboard date/time display to UTC and added explicit `UTC` labels in key UI tables/cards.
  - Added shared UTC formatting utilities in `src/dateTime.js` and refactored date rendering in app/components to use them.
  - Updated ratio table ordering to denominator-grouped order (`BTC`, `ETH`, `BNB`, `SOL`, `DOGE`, `HYPE`, `SUI`) and aligned ratio detail indexing with the same order.
  - Updated backtest execution timing to queue signals and execute on next bar open (TradingView-style fill timing).
  - Added DPSD parity metadata fields (`dpsd_UseEma`) across strategy configs and documented intentional no-op behavior for Pine parity.
  - Removed completed items from Improvements backlog:
    - integrate fundamental LTTI indicators with technical LTTI
    - reorder asset pairs in table

## 2026-04-15

- **Commit:** `0e3d14a`
- **Branch:** `master`
- **Summary of deployed changes:**
  - Added `Calmar Ratio` to Allocation Strategies and placed it after `Omega Ratio`.
  - Included `Calmar Ratio` in both `Simple Rank` and `Normalised Rank` calculations.
  - Renamed T-series strategy displays (`T 1`, `T 1.1`, `T 1.2`, `T 1.2.1`, `T 1.2.2`, `T 1.2.3`).
  - Added new strategies `T 2` and `T 2.1` with 50% joint-cap logic.

## 2026-04-16

- **Commit:** `ff41dd8`
- **Branch:** `master`
- **Summary of deployed changes:**
  - Added a shared `Refresh` button in the dashboard header so every page can trigger a manual refresh.
  - Manual refresh now reloads prices, full strategy data, Fear & Greed data, and timestamp labels.
  - Increased automatic full strategy reloads and Fear & Greed refreshes from 5 minutes to 20 minutes while keeping live price polling at 10 seconds.
  - Fixed React hook-ordering issues on the Market and Allocation pages that could crash the dashboard after loading completed.

## 2026-04-16

- **Commit:** `1301848`
- **Branch:** `master`
- **Summary of deployed changes:**
  - Cleaned up unused code paths and lint issues across app shell, indicators, and chart components.
  - Updated all stale `lttiLong` references to `ltti3dLong` in allocation backtest logic.
  - Refactored allocation chart color constants into `src/components/formulaColors.js` to satisfy fast-refresh/export rules.
  - Removed React state-in-effect and purity lint violations in Market/Fundamentals-related flows while preserving behavior.
