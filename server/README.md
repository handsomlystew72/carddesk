# CardDesk Pricing Server

A small Node.js/Express backend that proxies the TCGplayer and eBay APIs so
their secret keys never sit inside the CardDesk web page (where anyone could
view-source and steal them).

**Status: this code is real and ready to run, but it has not been tested
against live TCGplayer or eBay data** — that requires API credentials I can't
obtain on your behalf. Syntax has been checked; the actual API calls need to
be verified once you have real keys.

## What this does and doesn't give you

- **TCGplayer**: real catalog search + real market pricing, once you have
  approved API credentials.
- **eBay**: real *active listing* search (what people are currently asking).
  eBay's free, self-serve API does **not** include sold/completed prices —
  that data lives behind the Marketplace Insights API, which eBay only grants
  to approved partners on request. Until you have that approval, eBay
  numbers here mean "current asking price," not "confirmed sale price."
- **TAG**: not included. I don't have confirmation TAG (Technical
  Authentication & Grading) exposes a public pricing API at all.

## 1. Get API credentials

**TCGplayer** — apply at https://docs.tcgplayer.com. This requires partner
approval; it is not instant. Once approved you'll get a public key
(`client_id`) and private key (`client_secret`).

**eBay** — sign up free at https://developer.ebay.com. You can start
immediately with sandbox (fake data) keys; production keys (real listings)
require a short review, usually same-day.

## 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in the values you got from TCGplayer and eBay.

## 3. Install and run

Requires Node.js 18 or newer (for built-in `fetch`).

```bash
npm install
npm start
```

You should see:

```
CardDesk pricing server running on http://localhost:3001
```

## 4. Test it

```bash
curl "http://localhost:3001/health"

curl "http://localhost:3001/api/pricing/tcgplayer?name=Charizard"

curl "http://localhost:3001/api/pricing/ebay?query=Charizard+Base+Set+PSA+9"
```

If a call fails, the JSON error response includes the upstream status code
and message to help you debug (wrong keys, not-yet-approved app, etc).

### Narrowing to the exact card (not just a name match)

Both endpoints accept optional hints so a lookup finds the specific printing
you scanned, not just "something with this name":

```bash
# TCGplayer: narrow by card number, rarity, and/or set name
curl "http://localhost:3001/api/pricing/tcgplayer?name=Charizard&number=4&setName=Base+Set&rarity=Holo+Rare"

# Also request a specific printing variant's price (Holofoil, Unlimited, etc)
curl "http://localhost:3001/api/pricing/tcgplayer?name=Charizard&number=4&printing=Unlimited+Holofoil"

# eBay: narrow by set, number, and grading company/grade; excludes multi-card
# lot listings by default (add &excludeLots=false to turn that off)
curl "http://localhost:3001/api/pricing/ebay?query=Charizard&setName=Base+Set&number=4&grader=PSA&grade=9"
```

**How the matching actually works, and its limits:**

- **TCGplayer**: searches by name, then (if you gave hints) fetches each
  result's extended catalog fields and set name, scores them against your
  hints, and returns only the results that scored a match. If none of your
  hints matched anything, it returns the unfiltered name-search results
  rather than an empty list — a possibly-wrong result is more useful than a
  dead end. **Field names in `extendedData` (like "Number" and "Rarity")
  vary by category** — Pokémon, Yu-Gi-Oh, and sports cards may all use
  different field names. Once you have real API access, call
  `/catalog/products/{id}?getExtendedFields=true` for one known card and
  check the actual field names before trusting this blindly — you may need
  to adjust `extractExtendedField()` calls in `tcgplayerClient.js`.
- **eBay**: appends your hints into the search text (eBay's Browse API
  doesn't have structured "card number" filters, just free-text search),
  then scores each returned listing's title by how many of your search terms
  actually appear in it, filters out likely lot/bundle listings, and sorts
  best-match-first. This is a heuristic on top of eBay's own text search, not
  a guaranteed exact match — a well-worded scalper listing can still slip
  through, and a real card can occasionally get filtered out if the seller's
  title is unusual.

None of this has been run against live data — verify it behaves the way you
expect once you have real credentials, and tell me what you see so we can
adjust the scoring.

## 5. Deploy it somewhere real

This needs to run on an actual server (not inside the CardDesk HTML file).
Reasonable free/cheap options:

- **Render** (render.com) — connect a GitHub repo, it builds and runs `npm
  start` automatically. Free tier sleeps after inactivity.
- **Railway** (railway.app) — similar, usage-based free tier.
- **Fly.io** — more control, slightly more setup.

Avoid pure serverless platforms (Vercel/Netlify functions) for this unless
you swap the in-memory cache for something like Redis — serverless functions
restart between requests, so the token/price cache would reset constantly
and you'd burn through API rate limits faster.

Once deployed, set `ALLOWED_ORIGINS` in your environment variables to the
exact URL where CardDesk is hosted, so random sites can't call your server
and burn your API quota.

## 6. Wire it into CardDesk

Once this is deployed and confirmed working, CardDesk's frontend needs to be
updated to call `https://your-server-url/api/pricing/...` instead of (or
alongside) the free public databases it uses today. That's a separate change
to `carddesk.html` — let me know when you're at this step and we'll do it.
