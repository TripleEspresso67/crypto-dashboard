/**
 * MTTI-others parameters (from MTTI-others_14Mar2026.txt)
 * Applied to: ETH, BNB, DOGE, SOL, SUI, HYPE (all 1D)
 */
export const MTTI_OTHERS_PARAMS = {
  rsi: { rsiLength: 10, rsiSource: 'close', rsiEmaLen: 5 },
  impulsiveMomentum: {
    im_lenEMA_base: 21, im_atrMult_base: 1.3, im_atrLen_base: 14,
    im_lenEMA_mom: 12, im_atrLen_mom: 14, im_atrMult_mom: 1.3,
    im_lenMED: 28, im_madMult: 1.2,
    im_rsiLen: 50, im_rsiSmaLen: 30,
    im_Lu: 0, im_Su: 0, im_useRSI: true
  },
  sdZeroLag: {
    sd_len: 12, sd_type: 'zldema', sd_sdLength: 27,
    sd_upperSd: 1.036, sd_lowerSd: 0.982
  },
  dpsd: {
    dpsd_DemaLen: 24, dpsd_DemaSrc: 'open',
    dpsd_PerLen: 32, dpsd_perUp: 60, dpsd_perDown: 40,
    dpsd_SDlen: 27, dpsd_EmaLen: 25
  },
  rsiMomentumTrend: { rmt_Len2: 14, rmt_pmom: 55, rmt_nmom: 50 },
  stochForLoop: {
    st_smoothK: 1, st_periodD: 5, st_scoreBy: 'd > 50',
    st_a: 20, st_b: 35, st_maType: 'EMA', st_maLen: 9,
    st_sigmode: 'Fast', st_longth: 0.0, st_shortth: -0.6, st_fastth: 0.1
  },
  smartVolSuperTrend: { sv_emalen: 5, sv_vwsdlen: 30, sv_factor: 1.8 },
  longThresh: 0.1,
  shortThresh: -0.1,
  indicatorOrder: ['rsi', 'impulsiveMomentum', 'sdZeroLag', 'dpsd', 'rsiMomentumTrend', 'stochForLoop', 'smartVolSuperTrend'],
  indicatorCount: 7
};
