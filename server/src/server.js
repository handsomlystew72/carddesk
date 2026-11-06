require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pricingRoutes = require('./routes/pricing');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? true : allowedOrigins,
}));

app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/pricing', rateLimiter, pricingRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CardDesk pricing server running on http://localhost:${PORT}`);
});
