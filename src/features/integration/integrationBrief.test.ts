import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { buildIntegrationBrief, buildEmbedSnippet, PLACEHOLDER_INPUT } from './integrationBrief';

const input = {
  orgId: 'org_makehaven',
  orgName: 'MakeHaven',
  ecosystemId: 'eco_new_haven',
  ecosystemName: 'New Haven Network',
  functionsBaseUrl: 'https://us-central1-example.cloudfunctions.net',
  appBaseUrl: 'https://nexus.example.org',
};

describe('integration brief', () => {
  it('fills in the partner\'s identifiers', () => {
    const brief = buildIntegrationBrief(input);
    expect(brief).toContain('"eso_org_id": "org_makehaven"');
    expect(brief).toContain('"ecosystem_id": "eco_new_haven"');
    expect(brief).toContain('https://us-central1-example.cloudfunctions.net/partnerUpsertPerson');
  });

  it('never contains an API key — only where to read it from', () => {
    const brief = buildIntegrationBrief(input);
    expect(brief).not.toMatch(/sk_live_[0-9a-f]{8,}/);
    expect(brief).toContain('NEXUS_API_KEY');
  });

  it('states the rules the integration must follow', () => {
    const brief = buildIntegrationBrief(input);
    expect(brief).toContain('No bulk imports');
    expect(brief).toContain('entrepreneur_agreed');
    expect(brief).toContain('Never pre-tick');
  });

  it('points the consent block at this network', () => {
    expect(buildEmbedSnippet(input)).toContain('data-terms-url="https://us-central1-example.cloudfunctions.net/getConsentTerms"');
    expect(buildEmbedSnippet(input)).toContain('src="https://nexus.example.org/embed/nexus-consent.js"');
  });

  it('matches the committed docs/partner-api/INTEGRATION_BRIEF.md (run npm run docs:integration-brief)', () => {
    const committed = readFileSync(resolve(__dirname, '../../../docs/partner-api/INTEGRATION_BRIEF.md'), 'utf8');
    expect(committed.endsWith(buildIntegrationBrief(PLACEHOLDER_INPUT))).toBe(true);
  });
});
