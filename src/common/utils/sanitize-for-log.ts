/**
 * Redacts payment/sensitive fields before logging or serializing for logs.
 * Does not strip safe identifiers (order_id, customer_id, offer ids).
 */

const MAX_DEPTH = 14;

/** Keys whose values must never appear in logs (case-insensitive match). */
const REDACT_KEYS = new Set([
  'password',
  'secret',
  'authorization',
  'apikey',
  'api_key',
  'x-api-key',
  'creditcardnumber',
  'credit_card_number',
  'credit_card',
  'credit_card_no',
  'card_number',
  'cardnumber',
  'pan',
  'cvc',
  'cvv',
  'card_cvv',
  'cardcvv',
  'credit_card_expiry_month',
  'credit_card_expiry_year',
  'credit_card_exp_month',
  'credit_card_exp_year',
  'creditcardexpirymonth',
  'creditcardexpiryyear',
  'track1',
  'track2',
  'track_1',
  'track_2',
  'card_exp_month',
  'card_exp_year',
  'cardexpmonth',
  'cardexpyear',
  'bill_cc',
  'cc_number',
]);

function keyShouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  if (REDACT_KEYS.has(k)) return true;
  if (
    (k.includes('card') && (k.includes('number') || k.endsWith('_pan'))) ||
    k.includes('creditcard') ||
    (k.includes('card') && k.includes('cvv')) ||
    (k.includes('card') && k.includes('cvc'))
  ) {
    return true;
  }
  if (k.includes('password') || k.includes('passwd')) return true;
  if (
    k === 'token' ||
    k === 'access_token' ||
    k === 'refresh_token' ||
    k === 'payment_token' ||
    (k.endsWith('_token') && k !== 'cart_token')
  ) {
    return true;
  }
  return false;
}

/** Mask strings that look like card numbers (13–19 consecutive digits). */
export function maskCardLikeDigitsInString(s: string): string {
  return s.replace(/\b\d{13,19}\b/g, '****');
}

export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[MaxDepth]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return maskCardLikeDigitsInString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(obj)) {
      if (keyShouldRedact(key)) {
        out[key] = '[REDACTED]';
        continue;
      }
      out[key] = sanitizeForLog(v, depth + 1);
    }
    return out;
  }

  return '[Unsupported]';
}

/** Safe single-line JSON for log lines (no secrets / PAN patterns masked). */
export function safeJsonForLog(value: unknown, pretty = false): string {
  try {
    const sanitized = sanitizeForLog(value);
    return JSON.stringify(sanitized, null, pretty ? 2 : undefined) ?? '';
  } catch {
    return '[unserializable]';
  }
}
