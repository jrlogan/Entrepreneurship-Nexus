import { describe, it, expect } from 'vitest';
import { ORGANIZATION_TYPES } from '../../../functions/src/partnerOrgFields';
import { ENUMS } from '../standards/enums';
import type { OrganizationType } from './types';

describe('partner API org_type vocabulary', () => {
  it('matches the shared OrganizationType enum', () => {
    expect([...ORGANIZATION_TYPES].sort()).toEqual(ENUMS.OrganizationType.map((e) => e.id).sort());
    // Compile-time: every partner value is a domain OrganizationType.
    const typed: readonly OrganizationType[] = ORGANIZATION_TYPES;
    expect(typed.length).toBe(ORGANIZATION_TYPES.length);
  });
});
