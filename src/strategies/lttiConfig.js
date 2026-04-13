/**
 * LTTI parameters (from LTTI_14Mar2026.txt)
 * Applied to: BTC 3D chart
 */
export const LTTI_PARAMS = {
  rsiMomentumTrend: { rmt_Len2: 14, rmt_pmom: 60, rmt_nmom: 40 },
  rsi: { rsiLength: 14, rsiSource: 'close', rsiEmaLen: 7 },
  impulsiveMomentum: {
    im_lenEMA_base: 21, im_atrMult_base: 1.3, im_atrLen_base: 14,
    im_lenEMA_mom: 12, im_atrLen_mom: 14, im_atrMult_mom: 1.3,
    im_lenMED: 28, im_madMult: 1.2,
    im_rsiLen: 50, im_rsiSmaLen: 30,
    im_Lu: 0, im_Su: 0, im_useRSI: true
  },
  dpsd: {
    dpsd_DemaLen: 24, dpsd_DemaSrc: 'close',
    dpsd_PerLen: 32, dpsd_perUp: 60, dpsd_perDown: 40,
    dpsd_SDlen: 27, dpsd_EmaLen: 25, dpsd_UseEma: true
  },
  qpo: {
    qpo_length: 50, qpo_smooth: 9, qpo_atrLength: 23,
    qpo_atrMult: 0.9, qpo_trendThresholdPct: 0.9
  },
  fsvzo: {
    fsvzo_length: 9, fsvzo_signalLength: 3, fsvzo_smoothingLength: 10,
    fsvzo_fourierLength: 31, fsvzo_adfWindow: 50
  },
  madForLoop: {
    mad_ma_type: 'EMA', mad_ma_len: 10,
    mad_from: 0, mad_to: 18, mad_len: 10
  },
  longThresh: 0.1,
  shortThresh: -0.1,
  indicatorOrder: ['rsiMomentumTrend', 'rsi', 'impulsiveMomentum', 'dpsd', 'qpo', 'fsvzo', 'madForLoop'],
  indicatorCount: 7
};
