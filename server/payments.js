/**
 * Wallet deposits via Khmer System (ABA / KHQR)
 * Retail top-up fulfilment via Khmer TopUp
 */
const express = require('express');
const crypto = require('crypto');
const store = require('./store');
const khmerSystem = require('./khmerSystem');
const khmerTopup = require('./khmerTopup');

const router = express.Router();

function getKey(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return (req.headers['x-api-key'] || '').trim();
}

function authReseller(req, res, next) {
  const key = getKey(req);
  const resellers = store.read('resellers', []);
  const r = resellers.find((x) => x.apiKey === key && x.status === 'active');
  if (!r) return res.status(401).json({ ok: false, error: 'invalid_api_key' });
  req.reseller = r;
  next();
}

/** POST /api/v1/deposit/qr — create KHQR to top up reseller wallet */
router.post('/deposit/qr', authReseller, async (req, res) => {
  const amount = Number((req.body || {}).amount);
  if (!amount || amount < 0.1) {
    return res.status(400).json({ ok: false, error: 'amount_min_0.10' });
  }
  const bill = 'DEP' + Date.now().toString(36).toUpperCase();
  const deposits = store.read('deposits', []);

  // Demo / simulation when Khmer System not configured
  if (!khmerSystem.isPaymentReady()) {
    const row = {
      id: bill,
      resellerId: req.reseller.id,
      amount,
      status: 'pending',
      simulation: true,
      createdAt: new Date().toISOString(),
    };
    deposits.unshift(row);
    store.write('deposits', deposits.slice(0, 500));
    return res.json({
      ok: true,
      deposit_id: bill,
      amount,
      simulation: true,
      message: 'Demo mode — confirm deposit to credit wallet (no real KHQR)',
      qr_image: null,
    });
  }

  const qr = await khmerSystem.createQr(amount, bill, req.reseller.name || req.reseller.id);
  if (!qr.success) {
    return res.status(502).json({ ok: false, error: qr.error || 'qr_failed', detail: qr });
  }
  const row = {
    id: bill,
    resellerId: req.reseller.id,
    amount,
    status: 'pending',
    transaction_id: qr.transaction_id,
    verify_key: qr.verify_key,
    createdAt: new Date().toISOString(),
  };
  deposits.unshift(row);
  store.write('deposits', deposits.slice(0, 500));
  res.json({
    ok: true,
    deposit_id: bill,
    amount,
    qr_image: qr.qr_image,
    qr_string: qr.qr_string,
    transaction_id: qr.transaction_id,
    expires_at: qr.expired_at,
  });
});

/** POST /api/v1/deposit/:id/confirm — demo only: credit wallet without real payment */
router.post('/deposit/:id/confirm', authReseller, (req, res) => {
  const allow = process.env.ALLOW_DEMO_DEPOSIT !== '0';
  const deposits = store.read('deposits', []);
  const d = deposits.find((x) => x.id === req.params.id && x.resellerId === req.reseller.id);
  if (!d) return res.status(404).json({ ok: false, error: 'not_found' });
  if (d.status === 'paid') {
    return res.json({ ok: true, status: 'paid', amount: d.amount });
  }
  if (!d.simulation && khmerSystem.isPaymentReady()) {
    return res.status(400).json({ ok: false, error: 'use_poll', message: 'Real payment — poll deposit status instead' });
  }
  if (!allow) return res.status(403).json({ ok: false, error: 'demo_deposit_disabled' });
  d.status = 'paid';
  d.paidAt = new Date().toISOString();
  store.write('deposits', deposits);
  const resellers = store.read('resellers', []);
  const i = resellers.findIndex((x) => x.id === d.resellerId);
  if (i >= 0) {
    resellers[i].balance = Number((resellers[i].balance + d.amount).toFixed(4));
    store.write('resellers', resellers);
    return res.json({ ok: true, status: 'paid', amount: d.amount, balance: resellers[i].balance });
  }
  res.json({ ok: true, status: 'paid', amount: d.amount });
});

/** GET /api/v1/deposit/:id — poll payment */
router.get('/deposit/:id', authReseller, async (req, res) => {
  const deposits = store.read('deposits', []);
  const d = deposits.find((x) => x.id === req.params.id && x.resellerId === req.reseller.id);
  if (!d) return res.status(404).json({ ok: false, error: 'not_found' });

  if (d.status === 'paid') {
    return res.json({ ok: true, status: 'paid', amount: d.amount });
  }

  if (khmerSystem.isPaymentReady() && d.verify_key) {
    try {
      const chk = await khmerSystem.checkPayment(d.verify_key, d.transaction_id);
      if (chk && (chk.paid || chk.status === 'paid' || chk.success === true && chk.payment_status === 'paid')) {
        d.status = 'paid';
        d.paidAt = new Date().toISOString();
        store.write('deposits', deposits);
        const resellers = store.read('resellers', []);
        const i = resellers.findIndex((x) => x.id === d.resellerId);
        if (i >= 0) {
          resellers[i].balance = Number((resellers[i].balance + d.amount).toFixed(4));
          store.write('resellers', resellers);
        }
        return res.json({ ok: true, status: 'paid', amount: d.amount, balance: resellers[i]?.balance });
      }
    } catch (e) {
      /* keep pending */
    }
  }
  res.json({ ok: true, status: d.status, amount: d.amount });
});

/** Supplier status for admin */
router.get('/integrations', (req, res) => {
  res.json({
    ok: true,
    khmer_system: khmerSystem.isPaymentReady(),
    khmer_topup: khmerTopup.isTopupReady(),
  });
});

/**
 * Fulfil order through Khmer TopUp when configured.
 * Called from api.js after local wallet charge.
 */
async function fulfilViaKhmerTopup(order) {
  if (!khmerTopup.isTopupReady()) return { used: false };
  try {
    const result = await khmerTopup.placeOrder({
      packageId: order.supplier_package_id || order.package_id,
      playerId: order.player_id,
      serverId: order.server_id,
      reference: order.id,
    });
    return {
      used: true,
      success: true,
      supplier: result,
      order_code: result.order_code || result.id,
      status: result.status || 'processing',
    };
  } catch (e) {
    return { used: true, success: false, error: e.message, data: e.data };
  }
}

module.exports = { router, fulfilViaKhmerTopup };
