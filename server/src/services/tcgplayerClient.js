// TCGplayer API client.
//
// Auth: OAuth2 client-credentials flow — POST client_id + client_secret to
// /token, get back a bearer token good for ~14 days, cache it in memory.
//
// Getting credentials: TCGplayer's API requires partner approval
// (https://docs.tcgplayer.com) — it is not instant self-serve like eBay's.
// Apply, wait for approval, then you'll get a public/private key pair.

const cache = require('./cache');

const TCG_BASE = 'https://api.tcgplayer.com';

let tokenCache = { token: null, expiresAt: 0 };

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  if (!process.env.TCGPLAYER_CLIENT_ID || !process.env.TCGPLAYER_CLIENT_SECRET) {
    throw new Error('TCGPLAYER_CLIENT_ID / TCGPLAYER_CLIENT_SECRET are not set in the environment');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.TCGPLAYER_CLIENT_ID,
    client_secret: process.env.TCGPLAYER_CLIENT_SECRET,
  });

  const res = await fetch(`${TCG_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TCGplayer auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    // TCGplayer tokens typically last ~14 days; expires_in is in seconds.
    expiresAt: Date.now() + (data.expires_in || 1_209_600) * 1000,
  };
  return tokenCache.token;
}

/**
 * Search the TCGplayer catalog by product (card) name.
 * @param {string} name - card name to search for
 * @param {string|number} [categoryId] - optional TCGplayer category ID
 *   (e.g. Pokémon, YuGiOh, sports categories — see /catalog/categories)
 */
async function searchProductByName(name, categoryId) {
  const cacheKey = `tcg:search:${categoryId || 'any'}:${name.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();
  const url = new URL(`${TCG_BASE}/catalog/products`);
  url.searchParams.set('productName', name);
  if (categoryId) url.searchParams.set('categoryId', String(categoryId));
  url.searchParams.set('limit', '10');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TCGplayer product search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const results = data.results || [];
  cache.set(cacheKey, results, 10 * 60 * 1000); // catalog data changes rarely — 10 min cache
  return results;
}

/**
 * Get current market pricing for a list of TCGplayer product IDs.
 * Each result row is per printing/subtype (Normal, Holofoil, 1st Edition, etc)
 * — see getBestPriceRow() below for picking the right one.
 */
async function getPricingForProducts(productIds) {
  if (!productIds.length) return [];

  const cacheKey = `tcg:price:${productIds.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();
  const url = `${TCG_BASE}/pricing/product/${productIds.join(',')}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TCGplayer pricing fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const results = data.results || [];
  cache.set(cacheKey, results, 5 * 60 * 1000); // prices move faster — 5 min cache
  return results;
}

/**
 * Fetch extended catalog fields (Number, Rarity, Card Type, etc) for a list
 * of product IDs. Field names vary by category — inspect a real response for
 * your category before relying on a specific field name.
 */
async function getExtendedProductDetails(productIds) {
  if (!productIds.length) return [];

  const cacheKey = `tcg:details:${productIds.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();
  const url = new URL(`${TCG_BASE}/catalog/products/${productIds.join(',')}`);
  url.searchParams.set('getExtendedFields', 'true');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TCGplayer product detail fetch failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const results = data.results || [];
  cache.set(cacheKey, results, 10 * 60 * 1000);
  return results;
}

/**
 * Fetch set (group) names for a list of group IDs, so a set-name hint can be
 * compared against something human-readable rather than a raw numeric ID.
 */
async function getGroupNames(groupIds) {
  const uniqueIds = [...new Set(groupIds)].filter(Boolean);
  if (!uniqueIds.length) return new Map();

  const cacheKey = `tcg:groups:${uniqueIds.join(',')}`;
  let results = cache.get(cacheKey);

  if (!results) {
    const token = await getAccessToken();
    const url = `${TCG_BASE}/catalog/groups/${uniqueIds.join(',')}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`TCGplayer group lookup failed (${res.status}): ${body}`);
    }
    const data = await res.json();
    results = data.results || [];
    cache.set(cacheKey, results, 60 * 60 * 1000); // set names essentially never change
  }

  return new Map(results.map((g) => [g.groupId, g.name]));
}

function extractExtendedField(product, fieldName) {
  const fields = product.extendedData || [];
  const match = fields.find((f) => f.name && f.name.toLowerCase() === fieldName.toLowerCase());
  return match ? match.value : null;
}

/**
 * Search for a card by name and narrow the results to the specific printing
 * using optional hints (card number, rarity, set name). This is what makes
 * pricing "accurate" rather than "first loose name match":
 *
 *   findBestMatches('Charizard', pokemonCategoryId, { number: '4', setName: 'Base Set' })
 *
 * Scoring is intentionally conservative: if none of the hints match anything,
 * it returns the full unfiltered result set rather than silently returning
 * nothing — a wrong-but-present result is more useful to a caller than an
 * empty list caused by a hint that didn't line up with this category's field
 * names (verify actual field names against a real response for your category
 * before trusting this blindly).
 */
async function findBestMatches(name, categoryId, hints = {}) {
  const products = await searchProductByName(name, categoryId);
  if (!products.length) return [];

  const hasHints = hints.number || hints.rarity || hints.setName;
  if (!hasHints) return products;

  const [details, groupNames] = await Promise.all([
    getExtendedProductDetails(products.map((p) => p.productId)),
    hints.setName ? getGroupNames(products.map((p) => p.groupId)) : Promise.resolve(new Map()),
  ]);
  const detailsById = new Map(details.map((d) => [d.productId, d]));

  const scored = products.map((p) => {
    const detail = detailsById.get(p.productId) || p;
    let score = 0;

    if (hints.number) {
      const num = extractExtendedField(detail, 'Number');
      if (num && num.replace(/^0+/, '') === String(hints.number).replace(/^0+/, '')) score += 3;
    }
    if (hints.rarity) {
      const rarity = extractExtendedField(detail, 'Rarity');
      if (rarity && rarity.toLowerCase().includes(hints.rarity.toLowerCase())) score += 2;
    }
    if (hints.setName) {
      const groupName = groupNames.get(p.groupId);
      if (groupName && groupName.toLowerCase().includes(hints.setName.toLowerCase())) score += 2;
    }

    return { product: p, score };
  });

  const withSignal = scored.filter((s) => s.score > 0);
  if (withSignal.length === 0) return products; // hints matched nothing — don't over-filter, return everything

  withSignal.sort((a, b) => b.score - a.score);
  return withSignal.map((s) => s.product);
}

/**
 * Pick the right price row out of getPricingForProducts()'s results for a
 * given product, preferring an explicit printing/subtype if provided (e.g.
 * "Holofoil", "1st Edition Holofoil", "Unlimited"), otherwise falling back to
 * whatever the market-price-bearing row is.
 */
function getBestPriceRow(priceRows, productId, printing) {
  const rowsForProduct = priceRows.filter((r) => r.productId === productId);
  if (rowsForProduct.length === 0) return null;

  if (printing) {
    const exact = rowsForProduct.find(
      (r) => r.subTypeName && r.subTypeName.toLowerCase() === printing.toLowerCase()
    );
    if (exact) return exact;
  }

  return rowsForProduct.find((r) => typeof r.marketPrice === 'number') || rowsForProduct[0];
}

module.exports = {
  searchProductByName,
  getPricingForProducts,
  getExtendedProductDetails,
  getGroupNames,
  findBestMatches,
  getBestPriceRow,
};
