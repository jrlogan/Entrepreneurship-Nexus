"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyInteraction = classifyInteraction;
exports.buildInteractionWebhookPayload = buildInteractionWebhookPayload;
exports.buildReferralWebhookPayload = buildReferralWebhookPayload;
exports.scrubSensitiveKeys = scrubSensitiveKeys;
/**
 * Returns the highest tier this interaction qualifies as. Tier-4 (private)
 * interactions should be suppressed at the webhook trigger entirely — even
 * their metadata existence is sensitive (who-met-whom-when).
 */
function classifyInteraction(interaction) {
    if (interaction.note_confidential)
        return 'private';
    if (interaction.visibility === 'eso_private')
        return 'eso_owned';
    return 'consortium';
}
function buildInteractionWebhookPayload(interaction, interactionId) {
    const tier = classifyInteraction(interaction);
    if (tier === 'private') {
        return {
            payload: null,
            tier,
            suppressedReason: 'note_confidential=true; tier-4 interactions are not mirrored to webhooks',
        };
    }
    const payload = {
        interaction_id: interactionId,
        ecosystem_id: interaction.ecosystem_id ?? null,
        organization_id: interaction.organization_id ?? null,
        person_id: interaction.person_id ?? null,
        date: interaction.date ?? null,
        type: interaction.type ?? null,
        recorded_by: interaction.recorded_by ?? null,
        source: interaction.source ?? null,
        visibility: interaction.visibility ?? null,
    };
    return { payload, tier };
}
function buildReferralWebhookPayload(referral, referralId) {
    return {
        referral_id: referralId,
        ecosystem_id: referral.ecosystem_id ?? null,
        status: referral.status ?? null,
        referring_org_id: referral.referring_org_id ?? null,
        receiving_org_id: referral.receiving_org_id ?? null,
        subject_person_id: referral.subject_person_id ?? null,
        date: referral.date ?? null,
        intake_type: referral.intake_type ?? null,
        source: referral.source ?? null,
    };
}
// ─── Defensive sweep ─────────────────────────────────────────────────────────
/**
 * Final guard before HTTP transmission: scrubs known-sensitive keys from any
 * outbound payload. Belt-and-suspenders for the structured builders above —
 * if a future field accidentally enters the payload, this catches it.
 */
const NEVER_SEND_KEYS = new Set([
    'notes',
    'note',
    'response_notes',
    'private_notes',
    'internal_notes',
]);
function scrubSensitiveKeys(payload) {
    const out = {};
    for (const [k, v] of Object.entries(payload)) {
        if (NEVER_SEND_KEYS.has(k))
            continue;
        out[k] = v;
    }
    return out;
}
