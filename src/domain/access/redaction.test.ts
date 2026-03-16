import { describe, it, expect } from 'vitest';
import {
  redactOrganization,
  redactInitiative,
  redactInteraction,
  redactReferral,
  redactMetric,
  REDACTED_TEXT,
  RESTRICTED_INITIATIVE_NAME,
  RESTRICTED_METRIC_NOTE,
  ADMIN_VIEWER,
} from './redaction';
import type { Organization, Interaction, Referral, MetricLog, Initiative } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOrg: Organization = {
  id: 'org_1',
  name: 'Secret Startup',
  description: 'A stealth company',
  tax_status: 'for_profit',
  roles: ['startup'],
  demographics: { minority_owned: false, woman_owned: false, veteran_owned: false },
  classification: { industry_tags: ['fintech'] },
  external_refs: [{ source: 'Salesforce', id: '123' }],
  managed_by_ids: [],
  operational_visibility: 'restricted',
  authorized_eso_ids: [],
  version: 1,
  ecosystem_ids: ['eco_1'],
  api_keys: [{ id: 'k1', label: 'Prod', prefix: 'sk_live_...', created_at: '2024-01-01', status: 'active' }],
};

const baseInitiative: Initiative = {
  id: 'init_1',
  organization_id: 'org_1',
  ecosystem_id: 'eco_1',
  name: 'Project Moonshot',
  description: 'Building a rocket',
  notes: 'Secret fuel formula',
  current_stage_index: 2,
  status: 'active',
  stage_history: [],
  checklists: [{ checklist_id: 'c1', items: [] }],
};

const baseInteraction: Interaction = {
  id: 'int_1',
  organization_id: 'org_1',
  ecosystem_id: 'eco_1',
  author_org_id: 'org_partner',
  date: '2024-01-01',
  type: 'meeting',
  visibility: 'network_shared',
  note_confidential: false,
  notes: 'Founder mentioned running out of cash.',
  attendees: ['Sarah Connor', 'John Doe'],
  recorded_by: 'Special Agent',
  advisor_suggestions: [{ id: 'sug_1' } as any],
  advisor_acceptances: [{ id: 'acc_1' } as any],
};

const baseReferral: Referral = {
  id: 'ref_1',
  ecosystem_id: 'eco_1',
  referring_org_id: 'org_referrer',
  receiving_org_id: 'org_receiver',
  subject_person_id: 'person_123',
  subject_org_id: 'org_456',
  date: '2024-01-01',
  status: 'pending',
  notes: 'They need urgent legal help.',
  response_notes: 'We will look into this.',
  outcome: 'completed',
  outcome_tags: ['High Risk', 'Urgent'],
  owner_id: 'staff_789',
  follow_up_date: '2024-02-01',
};

const baseMetric: MetricLog = {
  id: 'met_1',
  organization_id: 'org_1',
  ecosystem_id: 'eco_1',
  date: '2024-01-01',
  metric_type: 'revenue',
  value: 500_000,
  source: 'self_reported',
  notes: 'Q4 revenue',
};

// ---------------------------------------------------------------------------
// Sentinel constants
// ---------------------------------------------------------------------------
describe('Redaction sentinel constants', () => {
  it('REDACTED_TEXT is a non-empty string', () => {
    expect(typeof REDACTED_TEXT).toBe('string');
    expect(REDACTED_TEXT.length).toBeGreaterThan(0);
  });

  it('RESTRICTED_INITIATIVE_NAME is a non-empty string', () => {
    expect(typeof RESTRICTED_INITIATIVE_NAME).toBe('string');
    expect(RESTRICTED_INITIATIVE_NAME.length).toBeGreaterThan(0);
  });

  it('RESTRICTED_METRIC_NOTE is a non-empty string', () => {
    expect(typeof RESTRICTED_METRIC_NOTE).toBe('string');
    expect(RESTRICTED_METRIC_NOTE.length).toBeGreaterThan(0);
  });

  it('ADMIN_VIEWER has platform_admin role', () => {
    expect(ADMIN_VIEWER.role).toBe('platform_admin');
  });
});

// ---------------------------------------------------------------------------
// redactOrganization
// ---------------------------------------------------------------------------
describe('redactOrganization', () => {
  it('clears api_keys — never expose keys in restricted view', () => {
    expect(redactOrganization(baseOrg).api_keys).toEqual([]);
  });

  it('clears external_refs — prevents triangulation with external systems', () => {
    expect(redactOrganization(baseOrg).external_refs).toEqual([]);
  });

  it('preserves public directory fields: id, name, description', () => {
    const r = redactOrganization(baseOrg);
    expect(r.id).toBe(baseOrg.id);
    expect(r.name).toBe(baseOrg.name);
    expect(r.description).toBe(baseOrg.description);
  });

  it('preserves ecosystem_ids', () => {
    expect(redactOrganization(baseOrg).ecosystem_ids).toEqual(baseOrg.ecosystem_ids);
  });

  it('does not mutate the original object', () => {
    redactOrganization(baseOrg);
    expect(baseOrg.api_keys).toHaveLength(1);
    expect(baseOrg.external_refs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// redactInitiative
// ---------------------------------------------------------------------------
describe('redactInitiative', () => {
  it('replaces name with RESTRICTED_INITIATIVE_NAME sentinel', () => {
    expect(redactInitiative(baseInitiative).name).toBe(RESTRICTED_INITIATIVE_NAME);
  });

  it('replaces description with REDACTED_TEXT', () => {
    expect(redactInitiative(baseInitiative).description).toBe(REDACTED_TEXT);
  });

  it('replaces notes with REDACTED_TEXT', () => {
    expect(redactInitiative(baseInitiative).notes).toBe(REDACTED_TEXT);
  });

  it('clears checklists — hides specific progress details', () => {
    expect(redactInitiative(baseInitiative).checklists).toEqual([]);
  });

  it('preserves velocity metadata: id, status, current_stage_index', () => {
    const r = redactInitiative(baseInitiative);
    expect(r.id).toBe(baseInitiative.id);
    expect(r.status).toBe(baseInitiative.status);
    expect(r.current_stage_index).toBe(baseInitiative.current_stage_index);
  });

  it('does not mutate the original object', () => {
    redactInitiative(baseInitiative);
    expect(baseInitiative.name).toBe('Project Moonshot');
  });
});

// ---------------------------------------------------------------------------
// redactInteraction
// ---------------------------------------------------------------------------
describe('redactInteraction', () => {
  it('replaces notes with REDACTED_TEXT', () => {
    expect(redactInteraction(baseInteraction).notes).toBe(REDACTED_TEXT);
  });

  it('clears attendees — hides who was present', () => {
    expect(redactInteraction(baseInteraction).attendees).toEqual([]);
  });

  it('masks recorded_by to generic "Agency Staff"', () => {
    expect(redactInteraction(baseInteraction).recorded_by).toBe('Agency Staff');
  });

  it('clears advisor_suggestions', () => {
    expect(redactInteraction(baseInteraction).advisor_suggestions).toEqual([]);
  });

  it('clears advisor_acceptances', () => {
    expect(redactInteraction(baseInteraction).advisor_acceptances).toEqual([]);
  });

  it('preserves flow metadata: id, author_org_id, date, type, visibility', () => {
    const r = redactInteraction(baseInteraction);
    expect(r.id).toBe(baseInteraction.id);
    expect(r.author_org_id).toBe(baseInteraction.author_org_id);
    expect(r.date).toBe(baseInteraction.date);
    expect(r.type).toBe(baseInteraction.type);
    expect(r.visibility).toBe(baseInteraction.visibility);
  });

  it('does not mutate the original object', () => {
    redactInteraction(baseInteraction);
    expect(baseInteraction.notes).not.toBe(REDACTED_TEXT);
    expect(baseInteraction.attendees).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// redactReferral
// ---------------------------------------------------------------------------
describe('redactReferral', () => {
  it('masks subject_person_id with REDACTED_TEXT sentinel', () => {
    expect(redactReferral(baseReferral).subject_person_id).toBe(REDACTED_TEXT);
  });

  it('removes subject_org_id — prevents confirming the client org', () => {
    expect(redactReferral(baseReferral).subject_org_id).toBeUndefined();
  });

  it('replaces notes with REDACTED_TEXT', () => {
    expect(redactReferral(baseReferral).notes).toBe(REDACTED_TEXT);
  });

  it('replaces response_notes with REDACTED_TEXT', () => {
    expect(redactReferral(baseReferral).response_notes).toBe(REDACTED_TEXT);
  });

  it('clears outcome_tags', () => {
    expect(redactReferral(baseReferral).outcome_tags).toEqual([]);
  });

  it('removes outcome — masks result details', () => {
    expect(redactReferral(baseReferral).outcome).toBeUndefined();
  });

  it('removes owner_id — masks internal workflow assignment', () => {
    expect(redactReferral(baseReferral).owner_id).toBeUndefined();
  });

  it('removes follow_up_date — masks internal scheduling', () => {
    expect(redactReferral(baseReferral).follow_up_date).toBeUndefined();
  });

  it('preserves flow metadata: id, referring_org_id, receiving_org_id, status, date', () => {
    const r = redactReferral(baseReferral);
    expect(r.id).toBe(baseReferral.id);
    expect(r.referring_org_id).toBe(baseReferral.referring_org_id);
    expect(r.receiving_org_id).toBe(baseReferral.receiving_org_id);
    expect(r.status).toBe(baseReferral.status);
    expect(r.date).toBe(baseReferral.date);
  });

  it('does not mutate the original object', () => {
    redactReferral(baseReferral);
    expect(baseReferral.notes).not.toBe(REDACTED_TEXT);
    expect(baseReferral.subject_person_id).toBe('person_123');
  });
});

// ---------------------------------------------------------------------------
// redactMetric
// ---------------------------------------------------------------------------
describe('redactMetric', () => {
  it('sets value to -1 sentinel — hides actual figure', () => {
    expect(redactMetric(baseMetric).value).toBe(-1);
  });

  it('replaces notes with RESTRICTED_METRIC_NOTE sentinel', () => {
    expect(redactMetric(baseMetric).notes).toBe(RESTRICTED_METRIC_NOTE);
  });

  it('preserves impact metadata: id, metric_type, date, source', () => {
    const r = redactMetric(baseMetric);
    expect(r.id).toBe(baseMetric.id);
    expect(r.metric_type).toBe(baseMetric.metric_type);
    expect(r.date).toBe(baseMetric.date);
    expect(r.source).toBe(baseMetric.source);
  });

  it('does not mutate the original object', () => {
    redactMetric(baseMetric);
    expect(baseMetric.value).toBe(500_000);
    expect(baseMetric.notes).toBe('Q4 revenue');
  });
});
