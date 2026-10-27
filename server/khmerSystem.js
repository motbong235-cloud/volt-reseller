/**
 * Khmer System Payment API (official docs)
 * https://khmer-system.com/api-docs
 *
 * Env (pick one secret):
 *   KHMER_SYSTEM_SECRET_KEY  preferred  (sk_live_...)
 *   ABA_API_KEY              fallback   (same secret_key)
 * Optional:
 *   KHMER_SYSTEM_TG_USER_ID  telegram user id used for all website checkouts (default "0")
 *   KHMER_SYSTEM_PAY_URL     default https://pay.khmer-system.com
 *
 * Note: the old /aba-api/generate-qr (api_key + merchant_id) is deprecated for
 * accounts that only have the v1 secret_key — it returns "invalid username".
 */

const PAY_BASE = (process.env.KHMER_SYSTEM_PAY_URL || "https://pay.khmer-system.com").replace(/\/$/, "");
const GENERATE_URL = `${PAY_BASE}/api/v1/payment/generate`;
const CHECK_URL = `${PAY_BASE}/api/v1/payment/check`;
const CONFIRM_URL = `${PAY_BASE}/api/v1/payment/confirm`;

function clean(v) {
  return String(v || "")
    .replace(/[\s\u200b\ufeff]+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
}

function secretKey() {
  return clean(process.env.KHMER_SYSTEM_SECRET_KEY || process.env.ABA_API_KEY);
}

function tgUserId() {
  const v = clean(process.env.KHMER_SYSTEM_TG_USER_ID);
  return v || "0";
}

/** Exactly 10 alphanumeric chars (required by Khmer System). */
function makeVerifyKey(seed) {
  const raw = String(seed || "") + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const alnum = raw.replace(/[^a-zA-Z0-9]/g, "");
  let out = (alnum + "ABCDEFGHJKMNPQRSTUVWXYZ23456789").slice(0, 10);
  if (out.length < 10) out = (out + "XXXXXXXXXX").slice(0, 10);
  return out.slice(0, 10);
}

function isPaymentReady() {
  return Boolean(secretKey());
}

/**
 * Create KHQR via official API.
 * Returns { success, qr_image, qr_string, transaction_id, verify_key, telegram_user_id, ... }
 */
async function createQr(amount, billNumber, description = "Porpor TOPUP") {
  if (!isPaymentReady()) {
    return { success: false, error: "KHMER_SYSTEM_SECRET_KEY / ABA_API_KEY not set" };
  }

  const verify_key = makeVerifyKey(billNumber);
  const telegram_user_id = tgUserId();
  const payload = {
    secret_key: secretKey(),
    amount: Number(amount),
    verify_key,
    telegram_user_id,
  };
  // optional overrides if set
  const bakong = clean(process.env.KHMER_SYSTEM_BAKONG_ACCOUNT);
  const mname = clean(process.env.KHMER_SYSTEM_MERCHANT_NAME);
  if (bakong) payload.bakong_account_id = bakong;
  if (mname) payload.merchant_name = mname;

  try {
    const r = await fetch(GENERATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const data = await r.json().catch(() => ({}));

    if (data.success && (data.qr_image_url || data.qr_string || data.transaction_id)) {
      return {
        success: true,
        qr_image: data.qr_image_url || data.qr_image || data.qr || "",
        qr_string: data.qr_string || data.qr_data || "",
        transaction_id: data.transaction_id || billNumber,
        verify_key,
        telegram_user_id,
        expired_at: data.expired_at,
        raw: data,
      };
    }

    return {
      success: false,
      error: data.error || data.message || `HTTP ${r.status}`,
      code: data.code,
      raw: data,
      verify_key,
      telegram_user_id,
    };
  } catch (e) {
    return { success: false, error: e.message || String(e), verify_key, telegram_user_id };
  }
}

/**
 * Poll payment status.
 * Prefer passing { verify_key, telegram_user_id } stored on the order.
 * Falls back to env telegram id.
 */
async function checkPayment(transactionIdOrMeta, maybeMeta) {
  if (!isPaymentReady()) {
    return { paid: false, error: "secret key not set" };
  }

  let verify_key;
  let telegram_user_id;
  if (transactionIdOrMeta && typeof transactionIdOrMeta === "object") {
    verify_key = transactionIdOrMeta.verify_key;
    telegram_user_id = transactionIdOrMeta.telegram_user_id;
  } else if (maybeMeta && typeof maybeMeta === "object") {
    verify_key = maybeMeta.verify_key;
    telegram_user_id = maybeMeta.telegram_user_id;
  }

  if (!verify_key) {
    return { paid: false, error: "missing verify_key on order — recreate QR" };
  }
  telegram_user_id = String(telegram_user_id || tgUserId());

  const qs = new URLSearchParams({
    secret_key: secretKey(),
    verify_key: String(verify_key),
    telegram_user_id,
  });

  try {
    const r = await fetch(`${CHECK_URL}?${qs}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    const status = String(data.status || "").toLowerCase();
    const paid = status === "completed" || status === "credit_confirmed" || status === "paid" || status === "success";
    return { paid, status, amount: data.amount, raw: data, credit_confirmed: !!data.credit_confirmed };
  } catch (e) {
    return { paid: false, error: e.message || String(e) };
  }
}

/** After delivery, mark credit confirmed (optional but recommended). */
async function confirmCredit(verify_key, telegram_user_id) {
  if (!isPaymentReady() || !verify_key) return { ok: false };
  try {
    const r = await fetch(CONFIRM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        secret_key: secretKey(),
        verify_key: String(verify_key),
        telegram_user_id: String(telegram_user_id || tgUserId()),
      }),
      signal: AbortSignal.timeout(15000),
    });
    return await r.json().catch(() => ({ ok: false }));
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Admin diagnose — hit generate with $0.01 test. */
async function diagnose() {
  const info = {
    endpoint: GENERATE_URL,
    secretSet: !!secretKey(),
    secretLength: secretKey().length,
    secretPrefix: secretKey() ? secretKey().slice(0, 6) + "…" : "",
    telegram_user_id: tgUserId(),
    usesLegacyAbaApi: false,
  };
  if (!isPaymentReady()) return { ...info, result: "secret key not set (KHMER_SYSTEM_SECRET_KEY or ABA_API_KEY)" };

  const test = await createQr(0.01, `TEST-${Date.now().toString(36)}`, "Porpor connection test");
  if (test.success) {
    return {
      ...info,
      result: "OK",
      http: "success",
      transaction_id: test.transaction_id,
      verify_key: test.verify_key,
      hasQr: !!(test.qr_image || test.qr_string),
    };
  }
  return { ...info, result: "FAILED", error: test.error, code: test.code, response: test.raw };
}

module.exports = {
  isPaymentReady,
  createQr,
  checkPayment: typeof checkPayment === 'function' ? checkPayment : async () => ({ ok: false, error: 'check_not_impl' }),
  confirmPayment: typeof confirmPayment === 'function' ? confirmPayment : async () => ({ ok: false }),
  diagnose: typeof diagnose === 'function' ? diagnose : async () => ({}),
  secretKey,
};
