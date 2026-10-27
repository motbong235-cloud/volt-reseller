const express = require('express');
const store = require('./store');

const router = express.Router();

function adminAuth(req, res, next) {
  const token =
    (req.headers['x-admin-token'] || '').trim() ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() ||
    (req.query.token || '').trim();
  const settings = store.read('settings', {});
  if (!token || token !== settings.adminToken) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

router.use(adminAuth);

router.get('/overview', (req, res) => {
  const resellers = store.read('resellers', []);
  const orders = store.read('orders', []);
  const catalog = store.read('catalog', []);
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => (o.createdAt || '').startsWith(today));
  res.json({
    ok: true,
    resellers: resellers.length,
    orders: orders.length,
    todayOrders: todayOrders.length,
    games: catalog.length,
    volumeToday: todayOrders.reduce((s, o) => s + (o.price || 0), 0),
  });
});

router.get('/resellers', (req, res) => {
  const list = store.read('resellers', []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    balance: r.balance,
    status: r.status,
    apiKey: r.apiKey,
    createdAt: r.createdAt,
  }));
  res.json({ ok: true, resellers: list });
});

router.post('/resellers', (req, res) => {
  const { name, email, balance } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
  const resellers = store.read('resellers', []);
  const r = {
    id: store.genId('rs'),
    name: String(name).trim(),
    email: (email || '').trim(),
    apiKey: store.genKey(),
    balance: Number(balance) || 0,
    currency: 'USD',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  resellers.push(r);
  store.write('resellers', resellers);
  res.status(201).json({ ok: true, reseller: r });
});

router.patch('/resellers/:id', (req, res) => {
  const resellers = store.read('resellers', []);
  const i = resellers.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not_found' });
  const { name, email, balance, status, regenerateKey } = req.body || {};
  if (name != null) resellers[i].name = String(name).trim();
  if (email != null) resellers[i].email = String(email).trim();
  if (balance != null) resellers[i].balance = Number(balance);
  if (status != null) resellers[i].status = status === 'active' ? 'active' : 'disabled';
  if (regenerateKey) resellers[i].apiKey = store.genKey();
  store.write('resellers', resellers);
  res.json({ ok: true, reseller: resellers[i] });
});

router.post('/resellers/:id/credit', (req, res) => {
  const amount = Number((req.body || {}).amount);
  if (!amount || amount === 0) return res.status(400).json({ ok: false, error: 'invalid_amount' });
  const resellers = store.read('resellers', []);
  const i = resellers.findIndex((x) => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'not_found' });
  resellers[i].balance = Number((resellers[i].balance + amount).toFixed(4));
  store.write('resellers', resellers);
  res.json({ ok: true, balance: resellers[i].balance });
});

router.get('/orders', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const orders = store.read('orders', []).slice(0, limit);
  res.json({ ok: true, orders });
});

router.get('/catalog', (req, res) => {
  res.json({ ok: true, catalog: store.read('catalog', []) });
});

router.put('/catalog', (req, res) => {
  const catalog = req.body?.catalog;
  if (!Array.isArray(catalog)) return res.status(400).json({ ok: false, error: 'catalog_array_required' });
  store.write('catalog', catalog);
  res.json({ ok: true });
});

module.exports = router;
