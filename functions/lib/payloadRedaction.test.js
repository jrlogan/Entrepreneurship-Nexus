"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const payloadRedaction_1 = require("./payloadRedaction");
// ---------------------------------------------------------------------------
// classifyInteraction
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('classifyInteraction', () => {
    (0, node_test_1.it)('returns "private" when note_confidential is true', () => {
        strict_1.default.equal((0, payloadRedaction_1.classifyInteraction)({ note_confidential: true }), 'private');
    });
    (0, node_test_1.it)('returns "private" even when visibility is set, if note_confidential is true', () => {
        strict_1.default.equal((0, payloadRedaction_1.classifyInteraction)({ note_confidential: true, visibility: 'network_shared' }), 'private');
    });
    (0, node_test_1.it)('returns "eso_owned" for visibility = eso_private', () => {
        strict_1.default.equal((0, payloadRedaction_1.classifyInteraction)({ visibility: 'eso_private' }), 'eso_owned');
    });
    (0, node_test_1.it)('returns "consortium" for default network_shared interactions', () => {
        strict_1.default.equal((0, payloadRedaction_1.classifyInteraction)({ visibility: 'network_shared' }), 'consortium');
    });
    (0, node_test_1.it)('returns "consortium" when no visibility flags are set', () => {
        strict_1.default.equal((0, payloadRedaction_1.classifyInteraction)({}), 'consortium');
    });
});
// ---------------------------------------------------------------------------
// buildInteractionWebhookPayload
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('buildInteractionWebhookPayload', () => {
    (0, node_test_1.it)('returns null payload for tier-4 (note_confidential)', () => {
        const r = (0, payloadRedaction_1.buildInteractionWebhookPayload)({ note_confidential: true, ecosystem_id: 'eco_1', notes: 'super secret' }, 'int_1');
        strict_1.default.equal(r.payload, null);
        strict_1.default.equal(r.tier, 'private');
        strict_1.default.match(r.suppressedReason || '', /note_confidential/);
    });
    (0, node_test_1.it)('returns a redacted payload for consortium tier', () => {
        const r = (0, payloadRedaction_1.buildInteractionWebhookPayload)({
            ecosystem_id: 'eco_1',
            organization_id: 'org_subj',
            person_id: 'p_1',
            date: '2026-05-08',
            type: 'meeting',
            recorded_by: 'p_staff',
            source: 'manual',
            visibility: 'network_shared',
            notes: 'these are the notes — must not appear',
            note_confidential: false,
        }, 'int_42');
        strict_1.default.notEqual(r.payload, null);
        strict_1.default.equal(r.tier, 'consortium');
        strict_1.default.equal(r.payload?.interaction_id, 'int_42');
        strict_1.default.equal(r.payload?.ecosystem_id, 'eco_1');
        strict_1.default.equal(r.payload?.visibility, 'network_shared');
        // structural test: notes must never be on the payload object
        strict_1.default.equal('notes' in r.payload, false);
    });
    (0, node_test_1.it)('passes through eso_owned tier (no suppression)', () => {
        const r = (0, payloadRedaction_1.buildInteractionWebhookPayload)({ visibility: 'eso_private', ecosystem_id: 'eco_1' }, 'int_99');
        strict_1.default.notEqual(r.payload, null);
        strict_1.default.equal(r.tier, 'eso_owned');
    });
    (0, node_test_1.it)('coerces missing optional fields to null', () => {
        const r = (0, payloadRedaction_1.buildInteractionWebhookPayload)({}, 'int_min');
        strict_1.default.equal(r.payload?.ecosystem_id, null);
        strict_1.default.equal(r.payload?.organization_id, null);
        strict_1.default.equal(r.payload?.person_id, null);
    });
});
// ---------------------------------------------------------------------------
// buildReferralWebhookPayload
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('buildReferralWebhookPayload', () => {
    (0, node_test_1.it)('never includes notes or response_notes', () => {
        const p = (0, payloadRedaction_1.buildReferralWebhookPayload)({
            ecosystem_id: 'eco_1',
            status: 'pending',
            referring_org_id: 'org_a',
            receiving_org_id: 'org_b',
            subject_person_id: 'p_1',
            date: '2026-05-08',
            intake_type: 'warm',
            source: 'manual_ui',
            notes: 'private referral note',
            response_notes: 'private response',
        }, 'ref_1');
        strict_1.default.equal('notes' in p, false);
        strict_1.default.equal('response_notes' in p, false);
        strict_1.default.equal(p.referral_id, 'ref_1');
        strict_1.default.equal(p.status, 'pending');
    });
    (0, node_test_1.it)('coerces missing fields to null', () => {
        const p = (0, payloadRedaction_1.buildReferralWebhookPayload)({}, 'ref_min');
        strict_1.default.equal(p.ecosystem_id, null);
        strict_1.default.equal(p.referring_org_id, null);
    });
});
// ---------------------------------------------------------------------------
// scrubSensitiveKeys (final defensive guard)
// ---------------------------------------------------------------------------
(0, node_test_1.describe)('scrubSensitiveKeys', () => {
    (0, node_test_1.it)('removes notes-like keys regardless of value', () => {
        const out = (0, payloadRedaction_1.scrubSensitiveKeys)({
            a: 1,
            notes: 'x',
            response_notes: 'y',
            private_notes: 'z',
            internal_notes: 'w',
            note: 'v',
            keep: 'this',
        });
        strict_1.default.deepEqual(out, { a: 1, keep: 'this' });
    });
    (0, node_test_1.it)('returns equivalent object when no sensitive keys present', () => {
        const inp = { a: 1, b: 'two', c: null };
        strict_1.default.deepEqual((0, payloadRedaction_1.scrubSensitiveKeys)(inp), inp);
    });
});
