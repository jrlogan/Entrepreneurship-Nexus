import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferralsView } from './ReferralsView';
import { AppDataProvider } from '../../data/AppDataContext';
import type { ViewerContext } from '../../domain/access/policy';
import type { Person, Referral } from '../../domain/types';
import type { Organization } from '../../domain/organizations/types';

const viewer: ViewerContext = {
  role: 'eso_admin',
  orgId: 'org_makehaven',
  personId: 'person_admin',
  ecosystemId: 'eco_ct',
};

const currentUser: Person = {
  id: 'person_admin',
  first_name: 'Maya',
  last_name: 'Admin',
  email: 'maya@makehaven.org',
  role: 'Program Director',
  system_role: 'eso_admin',
  organization_id: 'org_makehaven',
  ecosystem_id: 'eco_ct',
  memberships: [{ ecosystem_id: 'eco_ct', system_role: 'eso_admin', joined_at: '2024-01-01T00:00:00Z' }],
};

const referral: Referral = {
  id: 'ref_1',
  ecosystem_id: 'eco_ct',
  referring_org_id: 'org_ctinnovations',
  receiving_org_id: 'org_makehaven',
  subject_person_id: 'person_casey',
  subject_org_id: 'org_darkstar',
  date: '2026-03-01T00:00:00Z',
  status: 'pending',
  notes: 'Needs prototyping help.',
};

const people: Person[] = [
  currentUser,
  {
    id: 'person_staff',
    first_name: 'MakeHaven',
    last_name: 'Staff',
    email: 'eso.staff@makehaven.org',
    role: 'Coach',
    system_role: 'eso_staff',
    organization_id: 'org_makehaven',
    ecosystem_id: 'eco_ct',
    memberships: [{ ecosystem_id: 'eco_ct', system_role: 'eso_staff', joined_at: '2024-01-01T00:00:00Z' }],
  },
  {
    id: 'person_casey',
    first_name: 'Casey',
    last_name: 'Founder',
    email: 'casey@darkstar.example',
    role: 'Founder',
    system_role: 'entrepreneur',
    organization_id: 'org_darkstar',
    ecosystem_id: 'eco_ct',
    memberships: [{ ecosystem_id: 'eco_ct', system_role: 'entrepreneur', joined_at: '2024-01-01T00:00:00Z' }],
  },
];

const buildOrganization = (overrides: Partial<Organization>): Organization => ({
  id: 'org_default',
  name: 'Default Org',
  description: '',
  tax_status: 'for_profit',
  roles: ['startup'],
  owner_characteristics: [],
  classification: {
    industry_tags: [],
  },
  external_refs: [],
  managed_by_ids: [],
  operational_visibility: 'open',
  authorized_eso_ids: [],
  version: 1,
  ecosystem_ids: ['eco_ct'],
  ...overrides,
});

const organizations: Organization[] = [
  buildOrganization({
    id: 'org_makehaven',
    name: 'MakeHaven',
    email: 'info@makehaven.org',
    roles: ['eso', 'resource'],
  }),
  buildOrganization({
    id: 'org_ctinnovations',
    name: 'CT Innovations',
    email: 'hello@ctinnovations.org',
    roles: ['eso'],
  }),
  buildOrganization({
    id: 'org_darkstar',
    name: 'DarkStar Marine',
    email: 'team@darkstar.example',
    roles: ['startup'],
  }),
];

describe('ReferralsView assignment flow', () => {
  it('keeps assign reviewer disabled until a reviewer is selected', async () => {
    const repos = {
      referrals: {
        add: vi.fn(),
        accept: vi.fn(),
        decline: vi.fn(),
        close: vi.fn(),
        updateFollowUp: vi.fn(),
        assignOwner: vi.fn(),
      },
      interactions: { add: vi.fn() },
      consent: { hasOperationalAccess: vi.fn().mockReturnValue(false) },
    } as any;

    render(
      <AppDataProvider repos={repos} viewer={viewer}>
        <ReferralsView
          currentUser={currentUser}
          allReferrals={[referral]}
          organizations={organizations}
          people={people}
        />
      </AppDataProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Review'));
    await user.click(screen.getByRole('button', { name: 'Assign' }));

    expect(screen.getByRole('button', { name: 'Assign reviewer' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /MakeHaven Staff/i }));

    expect(screen.getByRole('button', { name: 'Assign reviewer' })).toBeEnabled();
  });

  it('assigns a reviewer from the pending referral action chooser', async () => {
    const assignOwner = vi.fn().mockResolvedValue(undefined);
    const repos = {
      referrals: {
        add: vi.fn(),
        accept: vi.fn(),
        decline: vi.fn(),
        close: vi.fn(),
        updateFollowUp: vi.fn(),
        assignOwner,
      },
      interactions: { add: vi.fn() },
      consent: { hasOperationalAccess: vi.fn().mockReturnValue(false) },
    } as any;

    const onRefresh = vi.fn();
    render(
      <AppDataProvider repos={repos} viewer={viewer}>
        <ReferralsView
          currentUser={currentUser}
          allReferrals={[referral]}
          organizations={organizations}
          people={people}
          onRefresh={onRefresh}
        />
      </AppDataProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Review'));
    await user.click(screen.getByRole('button', { name: 'Assign' }));
    await user.type(screen.getByLabelText('Choose Reviewer'), 'MakeHaven');
    await user.click(screen.getByRole('button', { name: /MakeHaven Staff/i }));
    await user.click(screen.getByRole('button', { name: 'Assign reviewer' }));

    await waitFor(() => {
      expect(assignOwner).toHaveBeenCalledWith('ref_1', 'person_staff');
    });
    expect(screen.getAllByText(/Reviewer assignment saved/i).length).toBeGreaterThan(0);
    expect(onRefresh).toHaveBeenCalled();
  });
});
