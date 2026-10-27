const path = require('path');
const express = require('express');
const cors = require('cors');
const store = require('./store');
const api = require('./api');
const admin = require('./admin');
const { router: paymentsRouter } = require('./payments');
const auth = require('./auth');
const crypto = require('crypto');

store.seed();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// health
app.get('/health', (req, res) => res.json({ ok: true, service: 'volt-reseller' }));

// Reseller API
app.use('/api/v1', api);
app.use('/api/v1', paymentsRouter);
app.use('/api/auth', auth.router);

// Admin API
app.use('/api/admin', admin);

// Telegram Login Widget verification
app.post('/api/auth/telegram', express.json(), (req, res) => {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const data = req.body || {};
  if (!botToken) {
    // accept for demo if no token — mark demo
    if (!data.id) return res.status(400).json({ ok: false, error: 'missing_telegram_user' });
    const users = require('./store').read('users', []);
    let u = users.find((x) => String(x.telegramId) === String(data.id));
    if (!u) {
      u = {
        id: 'tg_' + data.id,
        telegramId: String(data.id),
        username: data.username || '',
        firstName: data.first_name || '',
        lastName: data.last_name || '',
        photoUrl: data.photo_url || '',
        createdAt: new Date().toISOString(),
      };
      users.push(u);
      require('./store').write('users', users);
    }
    return res.json({ ok: true, user: u, demo: true });
  }
  // HMAC check per Telegram docs
  const { hash, ...rest } = data;
  const check = Object.keys(rest)
    .sort()
    .map((k) => k + '=' + rest[k])
    .join('\n');
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const hmac = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (hmac !== hash) return res.status(401).json({ ok: false, error: 'invalid_telegram_hash' });
  const authDate = Number(data.auth_date || 0);
  if (Date.now() / 1000 - authDate > 86400) {
    return res.status(401).json({ ok: false, error: 'telegram_auth_expired' });
  }
  const users = require('./store').read('users', []);
  let u = users.find((x) => String(x.telegramId) === String(data.id));
  if (!u) {
    u = {
      id: 'tg_' + data.id,
      telegramId: String(data.id),
      username: data.username || '',
      firstName: data.first_name || '',
      lastName: data.last_name || '',
      photoUrl: data.photo_url || '',
      createdAt: new Date().toISOString(),
    };
    users.push(u);
    require('./store').write('users', users);
  }
  res.json({ ok: true, user: u });
});

app.get('/api/config/public', (req, res) => {
  res.json({
    ok: true,
    siteName: 'VOLT',
    telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || '',
    telegramLoginEnabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME),
    khmerSystem: require('./khmerSystem').isPaymentReady(),
    khmerTopup: require('./khmerTopup').isTopupReady(),
  });
});


// Hide legacy public admin path
app.get(['/admin', '/admin/', '/admin.html'], (req, res) => {
  res.status(404).type('text').send('Not found');
});

// Static site
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// SPA-ish fallback for clean URLs
app.get(['/docs', '/docs/', '/dashboard', '/dashboard/', '/vt-x7k9m2', '/vt-x7k9m2/', '/shop', '/shop/', '/login', '/login/', '/register', '/register/'], (req, res) => {
  const map = {
    '/docs': 'docs.html',
    '/docs/': 'docs.html',
    '/dashboard': 'dashboard.html',
    '/dashboard/': 'dashboard.html',
    '/vt-x7k9m2': 'admin.html',
    '/vt-x7k9m2/': 'admin.html',
    '/shop': 'shop.html',
    '/shop/': 'shop.html',
    '/login': 'login.html',
    '/login/': 'login.html',
    '/register': 'login.html',
    '/register/': 'login.html',
  };
  res.sendFile(path.join(__dirname, '..', 'public', map[req.path] || 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VOLT reseller listening on :${PORT}`);
  console.log(`  Public API  → /api/v1`);
  console.log(`  Admin API   → /api/admin`);
  console.log(`  Docs        → /docs`);
});
