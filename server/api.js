/**
 * Reseller REST API v1
 * Auth: Authorization: Bearer <apiKey>  OR  X-API-Key: <apiKey>
 */
const express = require('express');
const store = require('./store');

const router = express.Router();

function getKey(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return (req.headers['x-api-key'] || '').trim();
}

function authReseller(req, res, next) {
  const key = getKey(req);
  if (!key) {
    return res.status(401).json({ ok: false, error: 'missing_api_key', message: 'Provide Authorization: Bearer <key> or X-API-Key' });
  }
  const resellers = store.read('resellers', []);
  const r = resellers.find((x) => x.apiKey === key && x.status === 'active');
  if (!r) {
    return res.status(401).json({ ok: false, error: 'invalid_api_key', message: 'API key invalid or account disabled' });
  }
  req.reseller = r;
  next();
}

/** GET /v1/me — balance & account */
router.get('/me', authReseller, (req, res) => {
  const r = req.reseller;
  res.json({
    ok: true,
    id: r.id,
    name: r.name,
    balance: Number(r.balance.toFixed(4)),
    currency: r.currency || 'USD',
    status: r.status,
  });
});

/** GET /v1/games — catalog at wholesale cost */
router.get('/games', authReseller, (req, res) => {
  const catalog = store.read('catalog', []);
  const games = catalog.map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    region: g.region,
    fields: g.fields,
    packages: (g.packages || []).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.cost,
      currency: 'USD',
    })),
  }));
  res.json({ ok: true, games });
});

/** GET /v1/games/:id */
router.get('/games/:id', authReseller, (req, res) => {
  const catalog = store.read('catalog', []);
  const g = catalog.find((x) => x.id === req.params.id || x.slug === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({
    ok: true,
    game: {
      id: g.id,
      name: g.name,
      slug: g.slug,
      region: g.region,
      fields: g.fields,
      packages: (g.packages || []).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.cost,
        currency: 'USD',
      })),
    },
  });
});

/** POST /v1/orders — create order (idempotent via reference) */
router.post('/orders', authReseller, (req, res) => {
  const { package_id, player_id, server_id, reference, callback_url } = req.body || {};
  if (!package_id) {
    return res.status(400).json({ ok: false, error: 'package_id_required' });
  }
  if (!player_id) {
    return res.status(400).json({ ok: false, error: 'player_id_required' });
  }

  const catalog = store.read('catalog', []);
  let pack = null;
  let game = null;
  for (const g of catalog) {
    const p = (g.packages || []).find((x) => x.id === package_id);
    if (p) {
      pack = p;
      game = g;
      break;
    }
  }
  if (!pack || !game) {
    return res.status(400).json({ ok: false, error: 'invalid_package' });
  }

  // required fields
  for (const f of game.fields || []) {
    if (f.required && f.key === 'server_id' && !server_id) {
      return res.status(400).json({ ok: false, error: 'server_id_required' });
    }
  }

  const orders = store.read('orders', []);
  if (reference) {
    const existing = orders.find(
      (o) => o.resellerId === req.reseller.id && o.reference === String(reference)
    );
    if (existing) {
      return res.json({
        ok: true,
        idempotent: true,
        order: publicOrder(existing),
      });
    }
  }

  const price = Number(pack.cost);
  const resellers = store.read('resellers', []);
  const idx = resellers.findIndex((x) => x.id === req.reseller.id);
  if (idx < 0) return res.status(401).json({ ok: false, error: 'invalid_api_key' });
  if (resellers[idx].balance < price) {
    return res.status(402).json({
      ok: false,
      error: 'insufficient_balance',
      balance: resellers[idx].balance,
      required: price,
    });
  }

  resellers[idx].balance = Number((resellers[idx].balance - price).toFixed(4));
  store.write('resellers', resellers);

  const order = {
    id: store.genId('NX'),
    resellerId: req.reseller.id,
    package_id: pack.id,
    package_name: pack.name,
    game_id: game.id,
    game_name: game.name,
    player_id: String(player_id),
    server_id: server_id ? String(server_id) : '',
    price,
    currency: 'USD',
    status: 'processing', // processing | success | failed | refunded
    reference: reference ? String(reference) : null,
    callback_url: callback_url || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  orders.unshift(order);
  store.write('orders', orders);

  // Simulate async fulfilment (demo: mark success after short delay in real deploy hook to supplier)
  setTimeout(() => {
    const list = store.read('orders', []);
    const o = list.find((x) => x.id === order.id);
    if (o && o.status === 'processing') {
      // 92% success demo
      o.status = Math.random() < 0.92 ? 'success' : 'failed';
      o.updatedAt = new Date().toISOString();
      if (o.status === 'failed') {
        // auto refund
        const rs = store.read('resellers', []);
        const ri = rs.findIndex((x) => x.id === o.resellerId);
        if (ri >= 0) {
          rs[ri].balance = Number((rs[ri].balance + o.price).toFixed(4));
          store.write('resellers', rs);
          o.status = 'refunded';
        }
      }
      store.write('orders', list);
    }
  }, 2500);

  res.status(201).json({
    ok: true,
    idempotent: false,
    order: publicOrder(order),
    balance: resellers[idx].balance,
  });
});

/** GET /v1/orders/:id */
router.get('/orders/:id', authReseller, (req, res) => {
  const orders = store.read('orders', []);
  const o = orders.find((x) => x.id === req.params.id && x.resellerId === req.reseller.id);
  if (!o) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, order: publicOrder(o) });
});

/** GET /v1/orders?limit=20 */
router.get('/orders', authReseller, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const orders = store.read('orders', [])
    .filter((x) => x.resellerId === req.reseller.id)
    .slice(0, limit)
    .map(publicOrder);
  res.json({ ok: true, orders });
});

function publicOrder(o) {
  return {
    id: o.id,
    status: o.status,
    game: o.game_name,
    package: o.package_name,
    package_id: o.package_id,
    player_id: o.player_id,
    server_id: o.server_id || undefined,
    price: o.price,
    currency: o.currency || 'USD',
    reference: o.reference || undefined,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

module.exports = router;
