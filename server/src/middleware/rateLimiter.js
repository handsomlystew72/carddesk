// Basic per-IP rate limiting to protect your API quota with TCGplayer/eBay
// from being burned by a runaway client or bot traffic. Not meant to replace
// a real gateway/WAF for a production app with many users — good enough for
// a personal project or small user base.

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const hits = new Map();

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  hits.set(ip, entry);

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
  }
  next();
}

module.exports = rateLimiter;
