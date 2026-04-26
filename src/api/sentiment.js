/**
 * Fetch the Crypto Fear & Greed Index from alternative.me (free, no auth).
 * Returns { value: 0-100, classification: string, timestamp: number }
 */
export async function fetchFearGreedIndex() {
  const res = await fetch('https://api.alternative.me/fng/?limit=1');
  if (!res.ok) throw new Error(`Fear & Greed API error: ${res.status}`);
  const json = await res.json();
  const entry = json.data?.[0];
  if (!entry) throw new Error('No Fear & Greed data');
  return {
    value: parseInt(entry.value, 10),
    classification: entry.value_classification,
    timestamp: parseInt(entry.timestamp, 10) * 1000,
  };
}

/**
 * Score the Fear & Greed Index:
 *   0-25  Extreme Fear  => +1 (contrarian bullish for long-term)
 *  26-45  Fear          =>  0 (neutral)
 *  46-55  Neutral       =>  0
 *  56-75  Greed         =>  0 (neutral)
 *  76-100 Extreme Greed => -1 (contrarian bearish for long-term)
 *
 * Note: For a "fundamental" long-term lens, extreme fear = opportunity,
 * extreme greed = caution. Adjust thresholds if you prefer trend-following.
 */
export function scoreFearGreed(value) {
  if (value <= 25) return 1;
  if (value >= 75) return -1;
  return 0;
}

/**
 * Fetch AlphaExtract AVS Trend text and map to a directional score.
 * Uses r.jina.ai as a text mirror so we can parse a JS-rendered page.
 * Returns { score: -1|1, trendLabel: string, signalLabel: string, fetchedAtMs: number }
 */
export async function fetchAvsTrendSignal() {
  const url = 'https://r.jina.ai/http://alphaextract.xyz/charts?selectedChart=avs-trend';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AVS Trend fetch error: ${res.status}`);

  const text = await res.text();

  // Parse the explicit current state field to avoid false matches
  // from explanatory text (which mentions both long and short).
  const marketConditionMatch = text.match(
    /market condition\s*\n+\s*([^\n\r]+)/i
  );
  const signalStatusMatch = text.match(
    /signal status\s*\n+\s*([^\n\r]+)/i
  );
  const latestValueMatch = text.match(
    /latest value\s*\n+\s*([^\n\r]+)/i
  );

  const marketConditionValue = marketConditionMatch?.[1]?.trim() || '';
  const signalStatusValue = signalStatusMatch?.[1]?.trim() || '';
  const latestValue = latestValueMatch?.[1]?.trim() || '';

  const combined = `${marketConditionValue} ${signalStatusValue} ${latestValue}`.toLowerCase();

  let score;
  let trendLabel;
  let signalLabel;

  if (/(uptrend|bullish|long)\b/.test(combined)) {
    score = 1;
    trendLabel = marketConditionValue || 'Uptrend';
    signalLabel = /long/.test(combined) ? 'Long' : 'Long';
  } else if (/(downtrend|bearish|short)\b/.test(combined)) {
    score = -1;
    trendLabel = marketConditionValue || 'Downtrend';
    signalLabel = /short/.test(combined) ? 'Short' : 'Short';
  } else {
    throw new Error('Unable to parse AVS Trend direction (expected long or short)');
  }

  return {
    score,
    trendLabel,
    signalLabel,
    fetchedAtMs: Date.now(),
  };
}
