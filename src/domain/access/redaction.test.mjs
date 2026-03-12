import test from 'node:test';
import assert from 'node:assert/strict';
import { 
    redactOrganization, 
    redactInitiative, 
    redactInteraction, 
    redactReferral,
    REDACTED_TEXT,
    RESTRICTED_INITIATIVE_NAME
} from './redaction.ts';

test('Redaction: Organization', () => {
    const org = {
        id: 'org_1',
        name: 'Secret Startup',
        api_keys: [{ id: 'key_1', prefix: 'sk_...' }],
        external_refs: [{ source: 'SFDC', id: '123' }]
    };

    const redacted = redactOrganization(org);
    assert.equal(redacted.name, org.name);
    assert.deepEqual(redacted.api_keys, []);
    assert.deepEqual(redacted.external_refs, []);
});

test('Redaction: Initiative', () => {
    const init = {
        id: 'init_1',
        name: 'Project Moonshot',
        description: 'Building a rocket',
        notes: 'Secret fuels included',
        checklists: [{ id: 'c1', label: 'Buy oxygen' }]
    };

    const redacted = redactInitiative(init);
    assert.equal(redacted.name, RESTRICTED_INITIATIVE_NAME);
    assert.equal(redacted.description, REDACTED_TEXT);
    assert.deepEqual(redacted.checklists, []);
});

test('Redaction: Interaction', () => {
    const interaction = {
        id: 'int_1',
        notes: 'Founder mentioned they are running out of cash.',
        attendees: ['Sarah Connor', 'John Doe'],
        recorded_by: 'Special Agent'
    };

    const redacted = redactInteraction(interaction);
    assert.equal(redacted.notes, REDACTED_TEXT);
    assert.deepEqual(redacted.attendees, []);
    assert.equal(redacted.recorded_by, 'Agency Staff');
});

test('Redaction: Referral', () => {
    const referral = {
        id: 'ref_1',
        subject_person_id: 'person_123',
        subject_org_id: 'org_456',
        notes: 'They need urgent legal help.',
        outcome: 'Rejected',
        outcome_tags: ['High Risk']
    };

    const redacted = redactReferral(referral);
    assert.equal(redacted.subject_person_id, REDACTED_TEXT);
    assert.equal(redacted.subject_org_id, undefined);
    assert.equal(redacted.notes, REDACTED_TEXT);
    assert.deepEqual(redacted.outcome_tags, []);
    assert.equal(redacted.outcome, undefined);
});
