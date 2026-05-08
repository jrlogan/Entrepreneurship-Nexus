/**
 * Server-side payload redaction by privacy tier for outbound webhooks and
 * (future) cross-ESO API responses. Centralizing this prevents notes and
 * other sensitive fields from leaking via ad-hoc field omissions that drift
 * over time. See project_privacy_5tier memory for the canonical tier model.
 *
 * Tiers:
 *   public      — directory info; auto-shareable
 *   consortium  — contact + activity metadata; requires tier-2 access
 *   eso_owned   — author ESO's data; cross-ESO requires explicit consent
 *   private     — note_confidential, etc.; never leaves the platform
 *   admin       — N/A for webhook payloads
 */

export type DataTier = 'public' | 'consortium' | 'eso_owned' | 'private' | 'admin';

// ─── Interaction classification ──────────────────────────────────────────────

export interface InteractionLike {
  note_confidential?: boolean;
  visibility?: string;
  notes?: unknown;
}

/**
 * Returns the highest tier this interaction qualifies as. Tier-4 (private)
 * interactions should be suppressed at the webhook trigger entirely — even
 * their metadata existence is sensitive (who-met-whom-when).
 */
export function classifyInteraction(interaction: InteractionLike): DataTier {
  if (interaction.note_confidential) return 'private';
  if (interaction.visibility === 'eso_private') return 'eso_owned';
  return 'consortium';
}

// ─── Webhook payload builders ────────────────────────────────────────────────

export interface InteractionWebhookPayload {
  interaction_id: string;
  ecosystem_id: string | null;
  organization_id: string | null;
  person_id: string | null;
  date: string | null;
  type: string | null;
  recorded_by: string | null;
  source: string | null;
  visibility: string | null;
  // Notes are deliberately absent from the type so they cannot be added by
  // accident. Receivers needing notes call partnerGetInteraction (gated on
  // consent) — they do not get them via webhook.
}

export interface InteractionPayloadResult {
  /** null = suppress the event (tier-4) */
  payload: InteractionWebhookPayload | null;
  tier: DataTier;
  /** human-readable reason for suppression, when applicable */
  suppressedReason?: string;
}

export function buildInteractionWebhookPayload(
  interaction: InteractionLike & Record<string, unknown>,
  interactionId: string,
): InteractionPayloadResult {
  const tier = classifyInteraction(interaction);
  if (tier === 'private') {
    return {
      payload: null,
      tier,
      suppressedReason: 'note_confidential=true; tier-4 interactions are not mirrored to webhooks',
    };
  }
  const payload: InteractionWebhookPayload = {
    interaction_id: interactionId,
    ecosystem_id: (interaction.ecosystem_id as string | undefined) ?? null,
    organization_id: (interaction.organization_id as string | undefined) ?? null,
    person_id: (interaction.person_id as string | undefined) ?? null,
    date: (interaction.date as string | undefined) ?? null,
    type: (interaction.type as string | undefined) ?? null,
    recorded_by: (interaction.recorded_by as string | undefined) ?? null,
    source: (interaction.source as string | undefined) ?? null,
    visibility: (interaction.visibility as string | undefined) ?? null,
  };
  return { payload, tier };
}

// ─── Referral webhook payload ────────────────────────────────────────────────

export interface ReferralLike {
  notes?: unknown;
  response_notes?: unknown;
}

export interface ReferralWebhookPayload {
  referral_id: string;
  ecosystem_id: string | null;
  status: string | null;
  referring_org_id: string | null;
  receiving_org_id: string | null;
  subject_person_id: string | null;
  date: string | null;
  intake_type: string | null;
  source: string | null;
  // notes / response_notes deliberately absent.
}

export function buildReferralWebhookPayload(
  referral: ReferralLike & Record<string, unknown>,
  referralId: string,
): ReferralWebhookPayload {
  return {
    referral_id: referralId,
    ecosystem_id: (referral.ecosystem_id as string | undefined) ?? null,
    status: (referral.status as string | undefined) ?? null,
    referring_org_id: (referral.referring_org_id as string | undefined) ?? null,
    receiving_org_id: (referral.receiving_org_id as string | undefined) ?? null,
    subject_person_id: (referral.subject_person_id as string | undefined) ?? null,
    date: (referral.date as string | undefined) ?? null,
    intake_type: (referral.intake_type as string | undefined) ?? null,
    source: (referral.source as string | undefined) ?? null,
  };
}

// ─── Defensive sweep ─────────────────────────────────────────────────────────

/**
 * Final guard before HTTP transmission: scrubs known-sensitive keys from any
 * outbound payload. Belt-and-suspenders for the structured builders above —
 * if a future field accidentally enters the payload, this catches it.
 */
const NEVER_SEND_KEYS: ReadonlySet<string> = new Set([
  'notes',
  'note',
  'response_notes',
  'private_notes',
  'internal_notes',
]);

export function scrubSensitiveKeys<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (NEVER_SEND_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out as T;
}
