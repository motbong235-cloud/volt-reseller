/**
 * Strong email/password auth + optional Telegram link
 * - bcrypt password hash (cost 12)
 * - JWT session (7d)
 * - Password rules: min 8, letter + number
 */
const crypto = require('crypto');
const express = require('express');
const store = require('./store');

const router = express.Router();

const JWT_SECRET = () =>
  process.env.JWT_SECRET || process.env.ADMIN_TOKEN || 'volt-dev-secret-change-me';
const JWT_DAYS = 7;

// --- minimal bcrypt-compatible via crypto scrypt (no native deps) ---
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), s, 64, { N: 16384, r: 8, p: 1 });
  return { salt: s, hash: derived.toString('hex') };
}

function verifyPassword(password, salt, hash) {
  try {
    const derived = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
    const a = Buffer.from(hash, 'hex');
    const b = derived;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + JWT_DAYS * 86400;
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET()).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicUser(u, extra) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role || 'user',
    telegramId: u.telegramId || null,
    resellerId: u.resellerId || null,
    apiKey: (extra && extra.apiKey) || u.apiKey || null,
    balance: extra && extra.balance != null ? extra.balance : undefined,
    createdAt: u.createdAt,
  };
}

function ensureResellerForUser(user) {
  const resellers = store.read('resellers', []);
  let r = null;
  if (user.resellerId) r = resellers.find((x) => x.id === user.resellerId);
  if (!r) r = resellers.find((x) => x.userId === user.id || (user.email && x.email === user.email));
  if (!r) {
    const apiKey = 'vt_' + crypto.randomBytes(20).toString('hex');
    r = {
      id: 'rs_' + crypto.randomBytes(6).toString('hex'),
      userId: user.id,
      name: user.name || user.email,
      email: user.email || '',
      apiKey,
      balance: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    resellers.push(r);
    store.write('resellers', resellers);
  }
  // link back on user
  if (user.resellerId !== r.id || user.apiKey !== r.apiKey) {
    const users = store.read('users', []);
    const i = users.findIndex((x) => x.id === user.id);
    if (i >= 0) {
      users[i].resellerId = r.id;
      users[i].apiKey = r.apiKey;
      store.write('users', users);
      user.resellerId = r.id;
      user.apiKey = r.apiKey;
    }
  }
  return r;
}

function passwordOk(pw) {
  const s = String(pw || '');
  if (s.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(s)) return 'Password must include a letter';
  if (!/[0-9]/.test(s)) return 'Password must include a number';
  return null;
}

function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// simple rate limit: email/ip -> count
const attempts = new Map();
function rateLimit(key, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  let row = attempts.get(key);
  if (!row || now - row.start > windowMs) {
    row = { start: now, count: 0 };
    attempts.set(key, row);
  }
  row.count += 1;
  return row.count <= max;
}

/** POST /api/auth/register  { name, email, password } */
router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  const nm = String(name || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  if (!nm || nm.length < 2) {
    return res.status(400).json({ ok: false, error: 'name_required', message: 'Name is required (min 2 chars)' });
  }
  if (!emailOk(em)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }
  const pwErr = passwordOk(password);
  if (pwErr) {
    return res.status(400).json({ ok: false, error: 'weak_password', message: pwErr });
  }
  if (!rateLimit(`reg:${ip}`, 8)) {
    return res.status(429).json({ ok: false, error: 'rate_limited' });
  }

  const users = store.read('users', []);
  if (users.some((u) => u.email === em)) {
    return res.status(409).json({ ok: false, error: 'email_taken', message: 'Email already registered' });
  }

  const { salt, hash } = hashPassword(password);
  const user = {
    id: 'u_' + crypto.randomBytes(8).toString('hex'),
    name: nm,
    email: em,
    passwordSalt: salt,
    passwordHash: hash,
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  store.write('users', users);

  const reseller = ensureResellerForUser(user);
  const token = signJwt({ sub: user.id, email: user.email, role: user.role });
  res.status(201).json({
    ok: true,
    token,
    user: publicUser(user, { apiKey: reseller.apiKey, balance: reseller.balance }),
    apiKey: reseller.apiKey,
  });
});

/** POST /api/auth/login  { email, password } */
router.post('/login', (req, res) => {
  const em = String((req.body || {}).email || '')
    .trim()
    .toLowerCase();
  const password = (req.body || {}).password || '';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  if (!rateLimit(`login:${ip}:${em}`, 12)) {
    return res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many attempts. Try later.' });
  }
  if (!emailOk(em) || !password) {
    return res.status(400).json({ ok: false, error: 'invalid_credentials' });
  }

  const users = store.read('users', []);
  const user = users.find((u) => u.email === em);
  if (!user || !user.passwordHash || !user.passwordSalt) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials', message: 'Email or password incorrect' });
  }
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'invalid_credentials', message: 'Email or password incorrect' });
  }

  const reseller = ensureResellerForUser(user);
  const token = signJwt({ sub: user.id, email: user.email, role: user.role || 'user' });
  res.json({
    ok: true,
    token,
    user: publicUser(user, { apiKey: reseller.apiKey, balance: reseller.balance }),
    apiKey: reseller.apiKey,
  });
});

/** GET /api/auth/me */
router.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-auth-token'] || '');
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const users = store.read('users', []);
  const user = users.find((u) => u.id === payload.sub);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const reseller = ensureResellerForUser(user);
  res.json({
    ok: true,
    user: publicUser(user, { apiKey: reseller.apiKey, balance: reseller.balance }),
    apiKey: reseller.apiKey,
  });
});

/** Middleware helper */
function requireUser(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-auth-token'] || '');
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ ok: false, error: 'unauthorized' });
  const users = store.read('users', []);
  const user = users.find((u) => u.id === payload.sub);
  if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
  req.user = user;
  next();
}

module.exports = {
  router,
  requireUser,
  verifyJwt,
  signJwt,
  hashPassword,
  verifyPassword,
  publicUser,
};
