import React, { useEffect, useMemo, useState } from 'react';
import type { Organization, Ecosystem, SystemRole } from '../../domain/types';
import { useRepos, useViewer } from '../../data/AppDataContext';
import { getFunctionsBaseUrl } from '../../services/httpFunctionClient';
import { Card } from '../../shared/ui/Components';
import { buildEmbedSnippet, buildIntegrationBrief, type IntegrationBriefInput } from './integrationBrief';

/**
 * Connect Your System — the page a partner lands on after signing.
 *
 * Shows where the partner stands (signed, key created, first people sent),
 * its identifiers, the consent block to paste into its signup form, and the
 * integration brief to hand to its developer or AI coding assistant — the
 * same brief as docs/partner-api/INTEGRATION_BRIEF.md, with this partner's
 * identifiers filled in.
 */

export interface IntegrationGuideViewProps {
  organization: Organization | null;
  ecosystem: Ecosystem;
  viewerRole: SystemRole;
  orgSignature: 'unknown' | 'signed' | 'unsigned';
  onOpenApiConsole: () => void;
  onOpenJoinNetwork: () => void;
}

const copy = async (text: string, onDone: () => void) => {
  try {
    await navigator.clipboard.writeText(text);
    onDone();
  } catch {
    // Clipboard can be unavailable (insecure context); the text is on screen.
  }
};

export const IntegrationGuideView = ({ organization, ecosystem, viewerRole, orgSignature, onOpenApiConsole, onOpenJoinNetwork }: IntegrationGuideViewProps) => {
  const repos = useRepos();
  const viewer = useViewer();
  const [keyCount, setKeyCount] = useState<number | null>(null);
  const [peopleSent, setPeopleSent] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const isAdmin = viewerRole === 'eso_admin' || viewerRole === 'platform_admin';

  const input: IntegrationBriefInput | null = useMemo(() => organization ? {
    orgId: organization.id,
    orgName: organization.name,
    ecosystemId: ecosystem.id,
    ecosystemName: ecosystem.name,
    functionsBaseUrl: getFunctionsBaseUrl(),
    appBaseUrl: window.location.origin,
  } : null, [organization, ecosystem]);

  const brief = useMemo(() => (input ? buildIntegrationBrief(input) : ''), [input]);
  const snippet = useMemo(() => (input ? buildEmbedSnippet(input) : ''), [input]);

  useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    if (isAdmin) {
      repos.organizations.getApiKeys(organization.id)
        .then((keys) => { if (!cancelled) setKeyCount(keys.filter((k) => k.status === 'active').length); })
        .catch(() => { if (!cancelled) setKeyCount(null); });
    }
    // People this organization has pushed carry a reference it owns.
    repos.people.getAll(viewer)
      .then((people) => {
        if (!cancelled) setPeopleSent(people.filter((p) => (p.external_refs || []).some((r) => r.owner_org_id === organization.id)).length);
      })
      .catch(() => { if (!cancelled) setPeopleSent(null); });
    return () => { cancelled = true; };
  }, [repos, viewer, organization, isAdmin]);

  if (!organization || !input) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        Choose the organization you are acting for (top left) to see its integration guide.
      </div>
    );
  }

  const flash = (label: string) => { setCopied(label); window.setTimeout(() => setCopied(null), 2000); };

  const download = () => {
    const blob = new Blob([brief], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-integration-${organization.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const steps: Array<{ label: string; done: boolean | null; detail: string; action?: { label: string; onClick: () => void } }> = [
    {
      label: 'Sign the network agreements',
      done: orgSignature === 'unknown' ? null : orgSignature === 'signed',
      detail: orgSignature === 'signed' ? 'Signed for this network.' : 'Needed before you can get an API key or see partners\' records.',
      action: orgSignature === 'signed' ? undefined : { label: 'Review and sign', onClick: onOpenJoinNetwork },
    },
    {
      label: 'Create an API key',
      done: isAdmin ? (keyCount === null ? null : keyCount > 0) : null,
      detail: isAdmin
        ? (keyCount ? `${keyCount} active key${keyCount === 1 ? '' : 's'}.` : 'Create one for the system you are connecting. It is shown once — store it as a secret.')
        : 'An admin of your organization creates API keys.',
      action: isAdmin && orgSignature === 'signed' ? { label: 'API Keys & Webhooks', onClick: onOpenApiConsole } : undefined,
    },
    {
      label: 'Send people from your system',
      done: peopleSent === null ? null : peopleSent > 0,
      detail: peopleSent ? `${peopleSent} ${peopleSent === 1 ? 'person' : 'people'} sent from your system so far.` : 'Nothing received from your system yet.',
    },
    {
      label: 'Add the consent block to your signup form',
      done: null,
      detail: 'So entrepreneurs see the network terms where they already sign up.',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-[#8b1919]">{ecosystem.name}</p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Connect {organization.name}</h1>
        <p className="mt-2 text-gray-700">
          Your staff keep working in your own system. When they enroll someone, record a meeting, or refer someone,
          your system tells the network — and referrals to you come back the same way. This page has everything your
          developer, or their AI coding assistant, needs.
        </p>
      </div>

      <Card title="Where you are">
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.done ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {step.done ? '✓' : index + 1}
                </span>
                <div>
                  <div className="font-medium text-gray-900">{step.label}</div>
                  <div className="text-sm text-gray-600">{step.detail}</div>
                </div>
              </div>
              {step.action && (
                <button type="button" onClick={step.action.onClick} className="shrink-0 rounded border border-[#8b1919] px-3 py-1.5 text-sm font-semibold text-[#8b1919] hover:bg-[#8b1919]/5">
                  {step.action.label}
                </button>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Hand this to your developer or AI coding assistant">
        <p className="text-sm text-gray-700">
          The integration brief is the complete contract, with your identifiers filled in: the rules your integration must
          follow, each API call with examples, error handling, and a checklist for being done. Give it to your developer, or
          paste it into an AI coding assistant (Claude Code, Cursor, Copilot, ChatGPT) together with a sentence about your
          system — for example, <em>"Our members are in CiviCRM; programs are CiviCRM memberships."</em>
        </p>
        <p className="mt-2 text-sm text-gray-700">It contains no API key. Keep the key in a secret store; the brief tells the code to read it from <code>NEXUS_API_KEY</code>.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy(brief, () => flash('brief'))} className="rounded-lg bg-[#8b1919] px-4 py-2 text-sm font-semibold text-white hover:bg-[#710a0a]">
            {copied === 'brief' ? 'Copied' : 'Copy the brief'}
          </button>
          <button type="button" onClick={download} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            Download as Markdown
          </button>
          <button type="button" onClick={() => setShowBrief((v) => !v)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50" aria-expanded={showBrief}>
            {showBrief ? 'Hide' : 'Read it here'}
          </button>
        </div>
        {showBrief && (
          <pre className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-800">{brief}</pre>
        )}
      </Card>

      <Card title="Your identifiers">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-[max-content_1fr]">
          {[
            ['API base URL', input.functionsBaseUrl],
            ['Organization ID (eso_org_id)', input.orgId],
            ['Network ID (ecosystem_id)', input.ecosystemId],
            ['Consent terms', `${input.functionsBaseUrl}/getConsentTerms`],
          ].map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="font-medium text-gray-600">{label}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <code className="truncate rounded bg-gray-100 px-2 py-0.5">{value}</code>
                <button type="button" onClick={() => void copy(value, () => flash(label))} className="shrink-0 text-xs font-semibold text-[#8b1919] hover:underline">
                  {copied === label ? 'Copied' : 'Copy'}
                </button>
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </Card>

      <Card title="The consent block for your signup form">
        <p className="text-sm text-gray-700">
          Paste this inside the form where entrepreneurs sign up for your programs. It shows the network's terms in the
          network's own words, with two choices that start off, and adds hidden fields your server passes on when it
          sends the person. Joining the network stays optional — it never blocks your own signup.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">{snippet}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy(snippet, () => flash('snippet'))} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            {copied === 'snippet' ? 'Copied' : 'Copy snippet'}
          </button>
          <a href="/consent?demo=1" target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-50">
            Preview what entrepreneurs see
          </a>
        </div>
      </Card>
    </div>
  );
};
