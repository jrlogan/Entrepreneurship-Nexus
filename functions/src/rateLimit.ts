/**
 * Rate limiting for the public partner API.
 *
 * The threat this addresses is enumeration, not load. External refs are
 * guessable by design, so an otherwise-legitimate key could walk another
 * organization's ID space to discover which people exist. Ownership scoping
 * (see findByExternalRef) closes the read; this bounds the attempt rate and
 * — more usefully — makes a sustained attempt visible.
 *
 * Counters live in Firestore rather than in memory because Cloud Functions
 * instances are ephemeral and horizontally scaled; an in-process map would
 * reset constantly and be trivially evaded.
 *
 * Windows are fixed rather than sliding: cheap (one document, one
 * transaction) and sufficient for this purpose. A caller can burst up to 2x
 * the limit across a window boundary, which is an acceptable trade for not
 * paying for a sorted set on every request.
 */

import * as admin from 'firebase-admin';

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Emit an alert when a caller crosses this fraction of the limit. */
  alertAt?: number;
}

/**
 * Defaults chosen against real integration behaviour: a normal partner pushes
 * on record save (a handful per minute, bursty during a staff work session),
 * while enumeration needs thousands of reads.
 */
export const PARTNER_RULES: Record<string, RateLimitRule> = {
  // Reads are the enumeration surface — tightest budget.
  read: { limit: 300, windowSeconds: 60, alertAt: 0.8 },
  // Writes are naturally paced by human activity in the partner's system.
  write: { limit: 600, windowSeconds: 60, alertAt: 0.9 },
  // Registration/provisioning: rare by nature, so a low ceiling is generous.
  register: { limit: 20, windowSeconds: 3600, alertAt: 0.5 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  count: number;
  limit: number;
}

/**
 * Consumes one unit of a caller's budget.
 *
 * `bucket` should identify the caller as narrowly as is meaningful — an API
 * key id for authenticated traffic, an IP for anonymous endpoints.
 */
export const consumeRateLimit = async (
  db: FirebaseFirestore.Firestore,
  bucket: string,
  ruleName: keyof typeof PARTNER_RULES | string,
  rule: RateLimitRule
): Promise<RateLimitResult> => {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const docId = `${ruleName}:${bucket}:${windowStart}`;
  const ref = db.collection('rate_limits').doc(docId);

  let count = 0;
  try {
    count = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = (snap.exists ? (snap.get('count') as number) : 0) || 0;
      const next = current + 1;
      tx.set(
        ref,
        {
          bucket,
          rule: ruleName,
          count: next,
          window_start: new Date(windowStart).toISOString(),
          // Retained briefly for investigation, then swept.
          expires_at: new Date(windowStart + windowMs * 3).toISOString(),
        },
        { merge: true }
      );
      return next;
    });
  } catch (err: any) {
    // A counter failure must not take the API down. Fail OPEN and say so
    // loudly: availability of the network matters more than a perfect
    // ceiling, and the audit trail still records the underlying calls.
    console.error('rate limit counter failed, allowing request:', err?.message);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, count: 0, limit: rule.limit };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));

  if (rule.alertAt && count === Math.ceil(rule.limit * rule.alertAt)) {
    // One alert per window per caller — at the threshold, not on every
    // subsequent request, so a sustained attempt doesn't bury the signal.
    console.warn(
      `RATE_LIMIT_APPROACHING rule=${ruleName} bucket=${bucket} count=${count}/${rule.limit}`
    );
    await db.collection('security_events').add({
      type: 'rate_limit_approaching',
      rule: ruleName,
      bucket,
      count,
      limit: rule.limit,
      created_at: new Date().toISOString(),
    }).catch(() => { /* alerting must never fail the request */ });
  }

  if (count > rule.limit) {
    if (count === rule.limit + 1) {
      console.warn(`RATE_LIMIT_EXCEEDED rule=${ruleName} bucket=${bucket}`);
      await db.collection('security_events').add({
        type: 'rate_limit_exceeded',
        rule: ruleName,
        bucket,
        count,
        limit: rule.limit,
        created_at: new Date().toISOString(),
      }).catch(() => { /* ignore */ });
    }
    return { allowed: false, remaining: 0, retryAfterSeconds, count, limit: rule.limit };
  }

  return { allowed: true, remaining: rule.limit - count, retryAfterSeconds, count, limit: rule.limit };
};

/**
 * Applies a rule and writes the 429 response itself when exceeded.
 * Returns true when the caller may proceed.
 */
export const enforceRateLimit = async (
  db: FirebaseFirestore.Firestore,
  bucket: string,
  ruleName: keyof typeof PARTNER_RULES,
  res?: any
): Promise<boolean> => {
  const rule = PARTNER_RULES[ruleName];
  const result = await consumeRateLimit(db, bucket, ruleName, rule);

  res?.set?.('X-RateLimit-Limit', String(result.limit));
  res?.set?.('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));

  if (!result.allowed) {
    res?.set?.('Retry-After', String(result.retryAfterSeconds));
    res?.status(429).json({
      error: 'Rate limit exceeded',
      limit: result.limit,
      window_seconds: rule.windowSeconds,
      retry_after_seconds: result.retryAfterSeconds,
    });
    return false;
  }
  return true;
};
