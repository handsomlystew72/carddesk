const express = require('express');
const router = express.Router();
const tcgplayer = require('../services/tcgplayerClient');
const ebay = require('../services/ebayClient');

// GET /api/pricing/tcgplayer?name=Charizard&categoryId=3&number=4&rarity=Holo+Rare&setName=Base+Set&printing=Unlimited+Holofoil
router.get('/tcgplayer', async (req, res) => {
  const { name, categoryId, number, rarity, setName, printing } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Missing required "name" query parameter' });
  }

  try {
    const products = await tcgplayer.findBestMatches(name, categoryId, { number, rarity, setName });
    if (!products.length) {
      return res.json({ results: [] });
    }

    const productIds = products.map((p) => p.productId);
    const pricing = await tcgplayer.getPricingForProducts(productIds);

    const merged = products.map((p) => {
      const marketRow = tcgplayer.getBestPriceRow(pricing, p.productId, printing);
      return {
        productId: p.productId,
        name: p.productName,
        groupId: p.groupId,
        imageUrl: p.imageUrl,
        printing: marketRow ? marketRow.subTypeName : null,
        marketPrice: marketRow ? marketRow.marketPrice : null,
        lowPrice: marketRow ? marketRow.lowPrice : null,
        source: 'TCGPLAYER',
      };
    });

    res.json({
      results: merged,
      matchedByHints: Boolean(number || rarity || setName),
    });
  } catch (err) {
    console.error('[pricing/tcgplayer]', err);
    res.status(502).json({ error: 'TCGplayer lookup failed', detail: err.message });
  }
});

// GET /api/pricing/ebay?query=Charizard&setName=Base+Set&number=4&grader=PSA&grade=9&categoryId=183454
router.get('/ebay', async (req, res) => {
  const { query, setName, number, grader, grade, categoryId, limit, excludeLots } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing required "query" query parameter' });
  }

  try {
    const results = await ebay.searchActiveListings(query, {
      setName,
      number,
      grader,
      grade,
      categoryId,
      excludeLots: excludeLots !== 'false',
      limit: limit ? parseInt(limit, 10) : 10,
    });
    res.json({
      results,
      note: 'These are current asking prices from active listings, not confirmed sold prices.',
    });
  } catch (err) {
    console.error('[pricing/ebay]', err);
    res.status(502).json({ error: 'eBay lookup failed', detail: err.message });
  }
});

module.exports = router;
