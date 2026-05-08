import { describe, it, expect } from 'vitest';
import {
  computeTextHash,
  getContent,
  PRIVACY_POLICY_CONTENT,
  DUA_CONTENT,
  FEDERATION_COMPACT_CONTENT,
  COMPACT_SUMMARY,
  type AgreementContent,
} from './content';

// computeTextHash determinism is load-bearing: once federation_compact is
// bumped to 1.0, hash equality drives whether to re-prompt prior signers.
// If hashing is unstable or insensitive to substantive text, signatures may
// silently invalidate (or fail to invalidate when terms change).

describe('computeTextHash', () => {
  it('returns the same hash for the same content on repeated calls', async () => {
    const a = await computeTextHash(FEDERATION_COMPACT_CONTENT);
    const b = await computeTextHash(FEDERATION_COMPACT_CONTENT);
    expect(a).toBe(b);
  });

  it('returns a 64-char lowercase hex string', async () => {
    const hash = await computeTextHash(DUA_CONTENT);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces distinct hashes for distinct content objects', async () => {
    const [pp, dua, compact] = await Promise.all([
      computeTextHash(PRIVACY_POLICY_CONTENT),
      computeTextHash(DUA_CONTENT),
      computeTextHash(FEDERATION_COMPACT_CONTENT),
    ]);
    expect(pp).not.toBe(dua);
    expect(pp).not.toBe(compact);
    expect(dua).not.toBe(compact);
  });

  it('changes when the title changes', async () => {
    const original: AgreementContent = { ...DUA_CONTENT, title: DUA_CONTENT.title };
    const modified: AgreementContent = { ...DUA_CONTENT, title: DUA_CONTENT.title + ' (revised)' };
    const a = await computeTextHash(original);
    const b = await computeTextHash(modified);
    expect(a).not.toBe(b);
  });

  it('changes when a section body changes', async () => {
    const a = await computeTextHash(DUA_CONTENT);
    const tampered: AgreementContent = {
      ...DUA_CONTENT,
      sections: DUA_CONTENT.sections.map((s, i) =>
        i === 0 ? { ...s, body: s.body + ' Material change.' } : s,
      ),
    };
    const b = await computeTextHash(tampered);
    expect(a).not.toBe(b);
  });

  it('changes when a section heading changes', async () => {
    const a = await computeTextHash(DUA_CONTENT);
    const tampered: AgreementContent = {
      ...DUA_CONTENT,
      sections: DUA_CONTENT.sections.map((s, i) =>
        i === 0 ? { ...s, heading: s.heading + ' (Updated)' } : s,
      ),
    };
    const b = await computeTextHash(tampered);
    expect(a).not.toBe(b);
  });

  it('ignores fields outside title and sections (badge styling)', async () => {
    // Hash should stay stable if we change purely cosmetic fields like
    // badge or badgeColor — they aren't part of the legal text.
    const a = await computeTextHash(DUA_CONTENT);
    const restyled: AgreementContent = {
      ...DUA_CONTENT,
      badge: 'DIFFERENT BADGE',
      badgeColor: 'bg-pink-500',
      checkLabel: 'Different label',
    };
    const b = await computeTextHash(restyled);
    expect(a).toBe(b);
  });

  it('is sensitive to section ordering (re-arranging changes the hash)', async () => {
    const a = await computeTextHash(DUA_CONTENT);
    const reversed: AgreementContent = {
      ...DUA_CONTENT,
      sections: [...DUA_CONTENT.sections].reverse(),
    };
    const b = await computeTextHash(reversed);
    // Sections are positional in the legal document, so reordering should
    // be treated as a different document.
    expect(a).not.toBe(b);
  });
});

describe('getContent', () => {
  it('returns each canonical content for its agreement type', () => {
    expect(getContent('privacy_policy')).toBe(PRIVACY_POLICY_CONTENT);
    expect(getContent('data_usage_agreement')).toBe(DUA_CONTENT);
    expect(getContent('federation_compact')).toBe(FEDERATION_COMPACT_CONTENT);
  });
});

describe('COMPACT_SUMMARY', () => {
  it('has at least three short bullets and no empty lines', () => {
    expect(COMPACT_SUMMARY.length).toBeGreaterThanOrEqual(3);
    for (const line of COMPACT_SUMMARY) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
  });
});
