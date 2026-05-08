import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInteraction,
  buildInteractionWebhookPayload,
  buildReferralWebhookPayload,
  scrubSensitiveKeys,
} from './payloadRedaction';

// ---------------------------------------------------------------------------
// classifyInteraction
// ---------------------------------------------------------------------------
describe('classifyInteraction', () => {
  it('returns "private" when note_confidential is true', () => {
    assert.equal(classifyInteraction({ note_confidential: true }), 'private');
  });

  it('returns "private" even when visibility is set, if note_confidential is true', () => {
    assert.equal(classifyInteraction({ note_confidential: true, visibility: 'network_shared' }), 'private');
  });

  it('returns "eso_owned" for visibility = eso_private', () => {
    assert.equal(classifyInteraction({ visibility: 'eso_private' }), 'eso_owned');
  });

  it('returns "consortium" for default network_shared interactions', () => {
    assert.equal(classifyInteraction({ visibility: 'network_shared' }), 'consortium');
  });

  it('returns "consortium" when no visibility flags are set', () => {
    assert.equal(classifyInteraction({}), 'consortium');
  });
});

// ---------------------------------------------------------------------------
// buildInteractionWebhookPayload
// ---------------------------------------------------------------------------
describe('buildInteractionWebhookPayload', () => {
  it('returns null payload for tier-4 (note_confidential)', () => {
    const r = buildInteractionWebhookPayload(
      { note_confidential: true, ecosystem_id: 'eco_1', notes: 'super secret' },
      'int_1',
    );
    assert.equal(r.payload, null);
    assert.equal(r.tier, 'private');
    assert.match(r.suppressedReason || '', /note_confidential/);
  });

  it('returns a redacted payload for consortium tier', () => {
    const r = buildInteractionWebhookPayload(
      {
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
      },
      'int_42',
    );
    assert.notEqual(r.payload, null);
    assert.equal(r.tier, 'consortium');
    assert.equal(r.payload?.interaction_id, 'int_42');
    assert.equal(r.payload?.ecosystem_id, 'eco_1');
    assert.equal(r.payload?.visibility, 'network_shared');
    // structural test: notes must never be on the payload object
    assert.equal('notes' in (r.payload as object), false);
  });

  it('passes through eso_owned tier (no suppression)', () => {
    const r = buildInteractionWebhookPayload(
      { visibility: 'eso_private', ecosystem_id: 'eco_1' },
      'int_99',
    );
    assert.notEqual(r.payload, null);
    assert.equal(r.tier, 'eso_owned');
  });

  it('coerces missing optional fields to null', () => {
    const r = buildInteractionWebhookPayload({}, 'int_min');
    assert.equal(r.payload?.ecosystem_id, null);
    assert.equal(r.payload?.organization_id, null);
    assert.equal(r.payload?.person_id, null);
  });
});

// ---------------------------------------------------------------------------
// buildReferralWebhookPayload
// ---------------------------------------------------------------------------
describe('buildReferralWebhookPayload', () => {
  it('never includes notes or response_notes', () => {
    const p = buildReferralWebhookPayload(
      {
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
      },
      'ref_1',
    );
    assert.equal('notes' in (p as object), false);
    assert.equal('response_notes' in (p as object), false);
    assert.equal(p.referral_id, 'ref_1');
    assert.equal(p.status, 'pending');
  });

  it('coerces missing fields to null', () => {
    const p = buildReferralWebhookPayload({}, 'ref_min');
    assert.equal(p.ecosystem_id, null);
    assert.equal(p.referring_org_id, null);
  });
});

// ---------------------------------------------------------------------------
// scrubSensitiveKeys (final defensive guard)
// ---------------------------------------------------------------------------
describe('scrubSensitiveKeys', () => {
  it('removes notes-like keys regardless of value', () => {
    const out = scrubSensitiveKeys({
      a: 1,
      notes: 'x',
      response_notes: 'y',
      private_notes: 'z',
      internal_notes: 'w',
      note: 'v',
      keep: 'this',
    });
    assert.deepEqual(out, { a: 1, keep: 'this' });
  });

  it('returns equivalent object when no sensitive keys present', () => {
    const inp = { a: 1, b: 'two', c: null };
    assert.deepEqual(scrubSensitiveKeys(inp), inp);
  });
});
