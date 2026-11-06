// eBay API client — uses the Browse API (free, self-serve developer account).
//
// IMPORTANT LIMITATION: the Browse API only returns ACTIVE listings (things
// currently for sale), not sold/completed comps. Real "what did this actually
// sell for" data lives behind eBay's Marketplace Insights API, which eBay
// only grants to approved partners on request — it is not open self-serve.
// Until/unless you get that approval, treat these numbers as "what sellers
// are asking," not "what it sold for."
//
// Auth: OAuth2 client-credentials flow using Basic auth with your App ID
// (client id) and Cert ID (client secret).

const cache = require('./cache');

const EBAY_BASE = process.env.EBAY_ENV === 'production'
  ? 'https://api.ebay.com'
  : 'https://api.sandbox.ebay.com';

let tokenCache = { token: null, expiresAt: 0 };

async function getAppToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    throw new Error('EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set in the environment');
  }

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${EBAY_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 7200) * 1000,
  };
  return tokenCache.token;
}

// Titles that look like multi-card lots/bundles will badly skew a single-card
// price if left in — a "Lot of 50 Pokemon cards" listing for $20 is not a $20
// Charizard. Filtered out by default; verify this regex against real listing
// titles once you have live data, wording varies a lot.
const LOT_PATTERN = /\b(lot|bundle|binder|collection)\b|\bset of\b|\bx\s?\d{2,}\b/i;

function scoreListingTitle(title, requiredTokens) {
  const lowerTitle = (title || '').toLowerCase();
  return requiredTokens.reduce((score, token) => (lowerTitle.includes(token.toLowerCase()) ? score + 1 : score), 0);
}

/**
 * Search currently active eBay listings matching a query, with optional
 * hints to tighten precision. Results are scored by how many of the search
 * terms actually appear in the listing title and sorted best-match-first —
 * eBay's own relevance ranking is a general-purpose text search, not aware
 * that "Charizard 4/102 Base Set" is one specific card, so this second pass
 * matters for accuracy.
 *
 * @param {string} query - base search text, e.g. "Charizard"
 * @param {object} [options]
 * @param {string} [options.setName] - e.g. "Base Set"
 * @param {string|number} [options.number] - card number, e.g. "4"
 * @param {string} [options.grader] - e.g. "PSA", "BGS", "CGC"
 * @param {string|number} [options.grade] - e.g. "9", "10"
 * @param {string|number} [options.categoryId] - eBay category ID to restrict
 *   the search to (e.g. trading card singles) — reduces noise from unrelated
 *   listings (plushes, posters, etc) if you look up the right category ID
 *   for your marketplace and card type.
 * @param {boolean} [options.excludeLots=true] - filter out likely multi-card
 *   lot/bundle listings.
 * @param {number} [options.limit=10]
 */
async function searchActiveListings(query, options = {}) {
  const { setName, number, grader, grade, categoryId, excludeLots = true, limit = 10 } = options;

  const queryParts = [query, setName, number ? `#${number}` : null, grader, grade].filter(Boolean);
  const fullQuery = queryParts.join(' ');

  const cacheKey = `ebay:search:${fullQuery.toLowerCase()}:${categoryId || 'any'}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const token = await getAppToken();
  const url = new URL(`${EBAY_BASE}/buy/browse/v1/item_summary/search`);
  url.searchParams.set('q', fullQuery);
  url.searchParams.set('limit', String(Math.max(limit * 2, 20))); // over-fetch, then filter down
  if (categoryId) url.searchParams.set('category_ids', String(categoryId));

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`eBay search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  let items = (data.itemSummaries || []).map((item) => ({
    itemId: item.itemId,
    title: item.title,
    price: item.price ? parseFloat(item.price.value) : null,
    currency: item.price ? item.price.currency : null,
    condition: item.condition || null,
    imageUrl: item.image ? item.image.imageUrl : null,
    url: item.itemWebUrl,
  }));

  if (excludeLots) {
    items = items.filter((item) => !LOT_PATTERN.test(item.title || ''));
  }

  const requiredTokens = queryParts.join(' ').split(/\s+/).filter(Boolean);
  items = items.map((item) => ({ ...item, matchScore: scoreListingTitle(item.title, requiredTokens) }));
  items.sort((a, b) => b.matchScore - a.matchScore);

  // Keep only listings matching at least half the search terms, unless that
  // would filter out everything — an imperfect result beats an empty one.
  const minScore = Math.ceil(requiredTokens.length / 2);
  const strong = items.filter((item) => item.matchScore >= minScore);
  const finalItems = (strong.length > 0 ? strong : items).slice(0, limit);

  cache.set(cacheKey, finalItems, 5 * 60 * 1000);
  return finalItems;
}

module.exports = { searchActiveListings };
