/**
 * exchangeRateService.js
 *
 * Fetches USD→PKR exchange rate from Open Exchange Rates API.
 * Caches the result for 1 hour to avoid redundant API calls.
 * Falls back to a stored/default rate if the API is unreachable.
 */

const https = require('https');

// ── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let _cache = {
  rate:      null,
  fetchedAt: null,
};

// ── Live fetch ────────────────────────────────────────────────────────────────

function fetchLiveRate() {
  return new Promise((resolve, reject) => {
    const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
    if (!appId) {
      return reject(new Error('OPEN_EXCHANGE_RATES_APP_ID env var not set'));
    }

    const options = {
      hostname: 'openexchangerates.org',
      path:     `/api/latest.json?app_id=${encodeURIComponent(appId)}&symbols=PKR`,
      method:   'GET',
      headers:  { Accept: 'application/json' },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.error) {
            return reject(new Error(json.description || json.message || 'API returned an error'));
          }
          const pkr = json?.rates?.PKR;
          if (!pkr) return reject(new Error('PKR rate not found in API response'));
          resolve(pkr);
        } catch (e) {
          reject(new Error(`Failed to parse exchange rate response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);

    // 8-second timeout
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Exchange rate request timed out after 8 s'));
    });

    req.end();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current USD→PKR rate with source metadata.
 *
 * Sources (in priority order):
 *   'live'     – freshly fetched from the API right now
 *   'cache'    – valid cached value (< 1 hour old)
 *   'stale'    – expired cached value used because the API failed
 *   'fallback' – hardcoded default (no cache + API unavailable)
 *
 * @param {number} [fallbackRate=280]  Rate used when no cache exists and API is down.
 * @returns {Promise<{ rate: number, source: string, fetchedAt: Date|null }>}
 */
async function getUsdToPkrRate(fallbackRate = 280) {
  const now = Date.now();

  // Fresh cache hit — skip network call
  if (_cache.rate && _cache.fetchedAt && (now - _cache.fetchedAt) < CACHE_TTL_MS) {
    return {
      rate:      _cache.rate,
      source:    'cache',
      fetchedAt: new Date(_cache.fetchedAt),
    };
  }

  // Attempt live fetch
  try {
    const rate = await fetchLiveRate();
    _cache = { rate, fetchedAt: now };
    return { rate, source: 'live', fetchedAt: new Date(now) };
  } catch (err) {
    console.warn('[ExchangeRate] Fetch failed:', err.message);

    // Return stale cache if available
    if (_cache.rate) {
      return {
        rate:      _cache.rate,
        source:    'stale',
        fetchedAt: _cache.fetchedAt ? new Date(_cache.fetchedAt) : null,
      };
    }

    // Last resort: hardcoded fallback
    return { rate: fallbackRate, source: 'fallback', fetchedAt: null };
  }
}

module.exports = { getUsdToPkrRate };
