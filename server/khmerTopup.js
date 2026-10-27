/**
 * Khmer TopUp reseller API — auto game delivery
 * Docs: https://khmer-topup.com/api-docs
 * Env: KHMER_TOPUP_API_KEY
 */
const BASE = process.env.KHMER_TOPUP_URL || "https://khmer-topup.com/api/v1";

function key() {
  return (process.env.KHMER_TOPUP_API_KEY || "").trim();
}

function isTopupReady() {
  return Boolean(key());
}

async function api(path, opts = {}) {
  if (!isTopupReady()) {
    throw Object.assign(new Error("KHMER_TOPUP_API_KEY not set"), { code: "not_configured" });
  }
  const headers = {
    Authorization: `Bearer ${key()}`,
    "X-API-Key": key(),
    Accept: "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers || {}),
  };
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || data.message || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function getBalance() {
  return api("/me");
}

async function listGames() {
  return api("/games");
}

async function verifyAccount(slug, playerId, serverId) {
  const q = new URLSearchParams({ slug, player_id: String(playerId) });
  if (serverId) q.set("server_id", String(serverId));
  return api(`/check?${q}`);
}

async function placeOrder({ packageId, playerId, serverId, reference }) {
  const body = {
    package_id: Number(packageId),
    player_id: String(playerId),
  };
  if (serverId) body.server_id = String(serverId);
  if (reference) body.reference = String(reference);

  return api("/orders", { method: "POST", body: JSON.stringify(body) });
}

async function getOrder(orderCode) {
  return api(`/orders/${encodeURIComponent(orderCode)}`);
}

module.exports = {
  isTopupReady,
  getBalance,
  listGames,
  verifyAccount,
  placeOrder,
  getOrder,
};
