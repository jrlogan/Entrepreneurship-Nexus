import React from 'react';
import type { Organization } from '../../domain/types';
import { Badge, Card, CompanyLogo } from '../../shared/ui/Components';

const SUPPORT_ROLES = ['eso', 'funder', 'resource'];

/**
 * Who is in the network, from the founder's side: the support organizations
 * that have signed the compact (members — they can coordinate about the
 * founder under the rules above) and the other resources merely listed
 * (nothing about the founder is shared with them). The signed flag comes
 * from the network view (`_compact_signed`), decided server-side.
 */
export const NetworkPartnersCard = ({
  organizations,
  ecosystemId,
  networkName,
}: {
  organizations: Organization[];
  ecosystemId: string;
  networkName?: string;
}) => {
  const supportOrgs = organizations.filter(
    (org) => org.ecosystem_ids.includes(ecosystemId) && (org.roles || []).some((r) => SUPPORT_ROLES.includes(r))
  );
  const signedOf = (org: Organization) => (org as Organization & { _compact_signed?: boolean })._compact_signed;
  const isReferralPartner = (org: Organization) => org.membership_tier === 'referral_partner';
  const byName = (a: Organization, b: Organization) => a.name.localeCompare(b.name);
  const members = supportOrgs.filter((org) => signedOf(org) === true && !isReferralPartner(org)).sort(byName);
  const referralPartners = supportOrgs.filter((org) => signedOf(org) === true && isReferralPartner(org)).sort(byName);
  const resources = supportOrgs.filter((org) => signedOf(org) !== true).sort(byName);

  return (
    <Card title={`Who is in ${networkName || 'the network'}`}>
      <p className="text-sm text-gray-600">
        Network members have signed the compact: they may coordinate about you under the rules above, and nothing else.
        Other resources are listed so you can find help; nothing about you is shared with them.
      </p>

      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Network members ({members.length})</h4>
      {members.length === 0 ? (
        <p className="mt-1 text-sm italic text-gray-500">No organization has signed the compact in this network yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {members.map((org) => <OrgRow key={org.id} org={org} badge={<Badge color="green">Member</Badge>} />)}
        </ul>
      )}

      {referralPartners.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Referral partners ({referralPartners.length})</h4>
          <p className="mt-1 text-xs text-gray-500">
            Organizations members can refer you to — only with your agreement. They see nothing about you until then, and never anything else.
          </p>
          <ul className="mt-2 space-y-2">
            {referralPartners.map((org) => <OrgRow key={org.id} org={org} badge={<Badge color="purple">Referral partner</Badge>} />)}
          </ul>
        </>
      )}

      {resources.length > 0 && (
        <>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Other resources ({resources.length})</h4>
          <ul className="mt-2 space-y-2">
            {resources.map((org) => <OrgRow key={org.id} org={org} badge={<Badge color="gray">Not a member</Badge>} />)}
          </ul>
        </>
      )}
    </Card>
  );
};

const OrgRow = ({ org, badge }: { org: Organization; badge: React.ReactNode }) => (
  <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div className="flex min-w-0 items-center gap-3">
      <CompanyLogo src={org.logo_url} name={org.name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-gray-900">{org.name}</div>
        {org.description && <div className="truncate text-xs text-gray-500">{org.description}</div>}
      </div>
    </div>
    {badge}
  </li>
);
