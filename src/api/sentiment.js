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
