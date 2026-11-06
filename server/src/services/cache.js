// Minimal in-memory cache with per-key expiry. Good enough for a single-process
// server. If you deploy this to a serverless platform (Vercel functions, etc.)
// this cache resets on every cold start — swap in Redis if that matters to you.

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

module.exports = { get, set };
