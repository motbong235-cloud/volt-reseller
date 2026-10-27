/**
 * Simple JSON file store — swap for Postgres/Redis in production.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILES = {
  settings: 'settings.json',
  resellers: 'resellers.json',
  orders: 'orders.json',
  catalog: 'catalog.json',
  deposits: 'deposits.json',
  users: 'users.json',
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read(name, fallback) {
  ensureDir();
  const p = path.join(DATA_DIR, FILES[name]);
  if (!fs.existsSync(p)) {
    write(name, fallback);
    return structuredClone(fallback);
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return structuredClone(fallback);
  }
}

function write(name, data) {
  ensureDir();
  const p = path.join(DATA_DIR, FILES[name]);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}

function genKey() {
  return 'vt_' + crypto.randomBytes(24).toString('hex');
}

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(6).toString('hex').toUpperCase();
}

const DEFAULT_CATALOG = [
  {
    id: 'mlbb',
    name: 'Mobile Legends',
    slug: 'mobile-legends',
    region: 'Global',
    fields: [
      { key: 'player_id', label: 'User ID', required: true },
      { key: 'server_id', label: 'Zone ID', required: true },
    ],
    packages: [
      { id: 'mlbb-86', name: '86 Diamonds', cost: 0.95 },
      { id: 'mlbb-172', name: '172 Diamonds', cost: 1.90 },
      { id: 'mlbb-257', name: '257 Diamonds', cost: 2.80 },
      { id: 'mlbb-344', name: '344 Diamonds', cost: 3.70 },
      { id: 'mlbb-429', name: '429 Diamonds', cost: 4.60 },
      { id: 'mlbb-514', name: '514 Diamonds', cost: 5.50 },
      { id: 'mlbb-706', name: '706 Diamonds', cost: 7.50 },
      { id: 'mlbb-2195', name: '2195 Diamonds', cost: 22.50 },
    ],
  },
  {
    id: 'ff',
    name: 'Free Fire',
    slug: 'free-fire',
    region: 'Global',
    fields: [{ key: 'player_id', label: 'Player ID', required: true }],
    packages: [
      { id: 'ff-100', name: '100 Diamonds', cost: 0.90 },
      { id: 'ff-310', name: '310 Diamonds', cost: 2.70 },
      { id: 'ff-520', name: '520 Diamonds', cost: 4.40 },
      { id: 'ff-1060', name: '1060 Diamonds', cost: 8.80 },
      { id: 'ff-2180', name: '2180 Diamonds', cost: 17.50 },
    ],
  },
  {
    id: 'pubg',
    name: 'PUBG Mobile',
    slug: 'pubg-mobile',
    region: 'Global',
    fields: [{ key: 'player_id', label: 'Player ID', required: true }],
    packages: [
      { id: 'pubg-60', name: '60 UC', cost: 0.95 },
      { id: 'pubg-325', name: '325 UC', cost: 4.80 },
      { id: 'pubg-660', name: '660 UC', cost: 9.50 },
      { id: 'pubg-1800', name: '1800 UC', cost: 24.00 },
    ],
  },
  {
    id: 'genshin',
    name: 'Genshin Impact',
    slug: 'genshin-impact',
    region: 'Global',
    fields: [
      { key: 'player_id', label: 'UID', required: true },
      { key: 'server_id', label: 'Server', required: true },
    ],
    packages: [
      { id: 'gi-60', name: '60 Genesis Crystals', cost: 0.99 },
      { id: 'gi-300', name: '300 + 30 Crystals', cost: 4.99 },
      { id: 'gi-980', name: '980 + 110 Crystals', cost: 14.99 },
      { id: 'gi-1980', name: '1980 + 260 Crystals', cost: 29.99 },
    ],
  },
  {
    id: 'roblox',
    name: 'Roblox',
    slug: 'roblox',
    region: 'Global',
    fields: [{ key: 'player_id', label: 'Username', required: true }],
    packages: [
      { id: 'rbx-80', name: '80 Robux', cost: 0.99 },
      { id: 'rbx-400', name: '400 Robux', cost: 4.99 },
      { id: 'rbx-800', name: '800 Robux', cost: 9.99 },
      { id: 'rbx-1700', name: '1700 Robux', cost: 19.99 },
    ],
  },
];

const DEFAULT_SETTINGS = {
  siteName: 'VOLT',
  tagline: 'Wholesale game top-up for resellers',
  currency: 'USD',
  adminToken: process.env.ADMIN_TOKEN || 'volt-admin-change-me',
  markupDefault: 0, // cost is already wholesale
};

function seed() {
  const catalog = read('catalog', DEFAULT_CATALOG);
  if (!catalog.length) write('catalog', DEFAULT_CATALOG);
  const settings = read('settings', DEFAULT_SETTINGS);
  if (!settings.adminToken) {
    settings.adminToken = DEFAULT_SETTINGS.adminToken;
    write('settings', settings);
  }
  // resellers created automatically on user register — no demo key
  read('orders', []);
  read('deposits', []);
  read('users', []);
}

module.exports = {
  read,
  write,
  genKey,
  genId,
  seed,
  DATA_DIR,
};
