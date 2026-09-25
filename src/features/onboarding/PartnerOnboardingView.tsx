import React, { useCallback, useEffect, useState } from 'react';
import type { Ecosystem, Organization, Person, SystemRole } from '../../domain/types';
import {
  AGREEMENT_VERSIONS,
  ORG_REQUIRED_AGREEMENTS,
  type OrgAgreementType,
} from '../../domain/agreements/types';
import { computeTextHash, getContent } from '../../domain/agreements/content';
import { classifySignature } from '../../domain/agreements/orgEnforcement';
import { FirebaseOrgAgreementsRepo } from '../../data/repos/firebase/orgAgreements';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { CONFIG } from '../../app/config';
import { useAuthContext } from '../../app/AuthProvider';

const orgAgreementsRepo = new FirebaseOrgAgreementsRepo();

/**
 * Joining the network, for a partner organization's admin.
 *
 * The organization signs three agreements for this network — the membership
 * terms, the compact it will present to entrepreneurs, and the data-usage
 * rules its staff follow — then goes to the integration guide. Until all
 * three are signed the organization gets no API key and sees only its own
 * records (enforced server-side: generatePartnerApiKey, getNetworkView).
 */

const STEP_INTRO: Record<OrgAgreementType, string> = {
  network_membership: 'What your organization commits to by joining — and what it keeps. You keep your own systems, your own data and your own client relationships.',
  federation_compact: 'What your entrepreneurs are told when they join. Your organization agrees to present these terms, unchanged, when it adds someone to the network — the integration guide shows how.',
  data_usage_agreement: 'How your staff may use information about entrepreneurs they see through the network.',
};

interface Props {
  organization: Organization | null;
  ecosystem: Ecosystem;
  person: Person;
  role: SystemRole;
  onSigned: () => void;
  onOpenIntegrationGuide: () => void;
}

export const PartnerOnboardingView = ({ organization, ecosystem, person, role, onSigned, onOpenIntegrationGuide }: Props) => {
  const { session } = useAuthContext();
  const isDemo = CONFIG.IS_DEMO_MODE || !isFirebaseEnabled();
  const canSign = role === 'eso_admin' || role === 'platform_admin';
  const [signed, setSigned] = useState<Record<OrgAgreementType, boolean>>({
    network_membership: false,
    federation_compact: false,
    data_usage_agreement: false,
  });
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0 = intro, 1..3 = agreements, 4 = done
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!organization) return;
    if (isDemo) { setLoading(false); return; }
    setLoading(true);
    try {
      const all = await orgAgreementsRepo.getForOrg(organization.id, ecosystem.id);
      const next = { ...signed };
      for (const type of ORG_REQUIRED_AGREEMENTS) {
        next[type] = classifySignature(all.find((s) => s.agreement_type === type), AGREEMENT_VERSIONS[type]) === 'signed';
      }
      setSigned(next);
      if (ORG_REQUIRED_AGREEMENTS.every((t) => next[t])) setStep(4);
    } catch {
      setError('Could not load your organization\'s signatures.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization, ecosystem.id, isDemo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setChecked(false); setError(''); }, [step]);

  if (!organization) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Your account is not linked to an organization yet. Ask the network administrator to check your invitation.
      </div>
    );
  }

  const currentType = step >= 1 && step <= ORG_REQUIRED_AGREEMENTS.length ? ORG_REQUIRED_AGREEMENTS[step - 1] : null;

  const signCurrent = async () => {
    if (!currentType) return;
    setBusy(true);
    setError('');
    try {
      if (!isDemo) {
        const content = getContent(currentType);
        await orgAgreementsRepo.sign({
          orgId: organization.id,
          ecosystemId: ecosystem.id,
          agreementType: currentType,
          textHash: await computeTextHash(content),
          // Rules require the signer to be the signed-in user.
          signedByUid: session.authUser?.uid || person.id,
          signedByPersonId: person.id,
          signedByName: `${person.first_name} ${person.last_name}`.trim(),
          signedByRole: role,
        });
      }
      const next = { ...signed, [currentType]: true };
      setSigned(next);
      const nextStep = ORG_REQUIRED_AGREEMENTS.findIndex((t) => !next[t]);
      if (nextStep === -1) {
        setStep(4);
        onSigned();
      } else {
        setStep(nextStep + 1);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not record the signature. Only an admin of your organization can sign.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#8b1919]">Joining {ecosystem.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">{organization.name}</h1>
        {isDemo && <p className="mt-2 text-sm text-amber-700">Demo — signatures here are not recorded.</p>}
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {['Welcome', ...ORG_REQUIRED_AGREEMENTS.map((t) => getContent(t).badge)].map((label, index) => {
          const type = index === 0 ? null : ORG_REQUIRED_AGREEMENTS[index - 1];
          const done = type ? signed[type] : step > 0;
          const active = step === index;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(index)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-[#8b1919] bg-white font-semibold' : 'border-gray-200 bg-gray-50'}`}
              >
                <span className={`mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {done ? '✓' : index + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {loading ? (
        <div className="rounded-lg bg-white p-6 shadow-sm">Loading…</div>
      ) : step === 0 ? (
        <div className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">What joining involves</h2>
          <p className="text-gray-700">
            The network is a shared agreement, not another system to log into. Your organization keeps its own software and records,
            and connects them so partners can make referrals, see who else is helping an entrepreneur, and report together.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-gray-700">
            <li><strong>Sign three agreements</strong> for this network (about 10 minutes of reading). They are pilot versions the consortium can still revise; if they change, you will be asked to re-sign.</li>
            <li><strong>Get your API key</strong> — issued only after signing.</li>
            <li><strong>Connect your system</strong> using the integration guide. It is written so your developer, or an AI coding assistant, can follow it directly.</li>
          </ul>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">The privacy model you are signing up to</div>
            <div className="mt-2"><strong>Always shared</strong> with partners who work with the same entrepreneur: name and email, and the fact of each other's activity (who, what kind, when).</div>
            <div className="mt-1"><strong>Only with the entrepreneur's consent</strong>: directory listing, and the details of another organization's records.</div>
            <div className="mt-1"><strong>Never shared</strong>: your notes, financials, and your internal record IDs.</div>
          </div>
          {!canSign && (
            <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Only an admin of {organization.name} can sign for the organization. You can read the agreements here; ask your admin to sign.
            </p>
          )}
          <button type="button" onClick={() => setStep(1)} className="rounded-lg bg-[#8b1919] px-5 py-2.5 font-semibold text-white hover:bg-[#710a0a]">
            Read the agreements
          </button>
        </div>
      ) : currentType ? (() => {
        const content = getContent(currentType);
        return (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">{content.title}</h2>
              <span className="text-xs text-gray-500">version {AGREEMENT_VERSIONS[currentType]}</span>
            </div>
            <p className="text-gray-700">{STEP_INTRO[currentType]}</p>
            <div className="max-h-[50vh] space-y-4 overflow-y-auto rounded-lg border border-gray-200 p-4">
              {content.sections.map((section) => (
                <div key={section.heading}>
                  <h3 className="text-sm font-semibold text-gray-900">{section.heading}</h3>
                  <p className="text-sm leading-6 text-gray-700">{section.body}</p>
                </div>
              ))}
            </div>
            {signed[currentType] ? (
              <p className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Signed for {organization.name}.</p>
            ) : canSign ? (
              <>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1 accent-[#8b1919]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                  <span>
                    {currentType === 'network_membership' ? content.checkLabel : `On behalf of ${organization.name}, we agree to this ${content.badge}.`}
                    <span className="block text-xs text-gray-500">Signed by {person.first_name} {person.last_name} ({role.replace('_', ' ')}) for {ecosystem.name}.</span>
                  </span>
                </label>
                <button
                  type="button"
                  disabled={!checked || busy}
                  onClick={() => void signCurrent()}
                  className="rounded-lg bg-[#8b1919] px-5 py-2.5 font-semibold text-white hover:bg-[#710a0a] disabled:opacity-40"
                >
                  {busy ? 'Signing…' : 'Sign for my organization'}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-600">An admin of {organization.name} needs to sign this.</p>
            )}
            {error && <p className="text-sm text-red-700">{error}</p>}
          </div>
        );
      })() : (
        <div className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{organization.name} has joined {ecosystem.name}</h2>
          <p className="text-gray-700">
            All three agreements are signed. Next, connect your system: the integration guide walks your developer — or their AI coding
            assistant — through creating an API key, sending people and program participation, recording referrals, and adding the
            consent block to your signup form.
          </p>
          <button type="button" onClick={onOpenIntegrationGuide} className="rounded-lg bg-[#8b1919] px-5 py-2.5 font-semibold text-white hover:bg-[#710a0a]">
            Open the integration guide
          </button>
        </div>
      )}
    </div>
  );
};
