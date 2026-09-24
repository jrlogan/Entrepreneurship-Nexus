import React, { useEffect, useMemo, useState } from 'react';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { CONFIG } from '../../app/config';
import { buildConsentTerms, type ConsentTerms } from '../../../functions/src/consent/terms';

/**
 * /consent?token=…  — the hosted consent page.
 *
 * Where a founder lands from the consent email, or from a partner's signup
 * flow that sent them here with partnerCreateConsentLink. No account needed:
 * the one-time token is the credential. Shows the plain-language summary, the
 * full Network Compact and Privacy Notice, and the two choices — both off by
 * default — then records the answers (consentAccept) and, if the partner gave
 * a return URL, sends the founder back to the partner's site.
 *
 * `/consent?demo=1` renders the page with sample data and records nothing,
 * so partners can see exactly what their entrepreneurs will see.
 */

type Session = {
  status: 'pending';
  first_name: string;
  requested_by: string;
  network_name: string;
  returns_to: string | null;
  current: { terms_accepted: boolean; directory_listed: boolean; shares_details: boolean };
  terms: ConsentTerms;
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; session: Session }
  | { kind: 'done'; result: 'accepted' | 'declined'; returnUrl: string | null; returnsTo: string | null };

const BRAND = 'bg-[#8b1919] hover:bg-[#710a0a]';

export const ConsentRoute = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get('token') || '';
  const isDemo = params.get('demo') === '1' || CONFIG.IS_DEMO_MODE || !isFirebaseEnabled();

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [agreed, setAgreed] = useState(false);
  const [directoryListing, setDirectoryListing] = useState(false);
  const [shareDetails, setShareDetails] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (isDemo) {
          const terms = await buildConsentTerms();
          if (!cancelled) {
            setPhase({
              kind: 'ready',
              session: {
                status: 'pending',
                first_name: 'Grace',
                requested_by: 'MakeHaven',
                network_name: 'the New Haven entrepreneurship network',
                returns_to: null,
                current: { terms_accepted: false, directory_listed: false, shares_details: false },
                terms,
              },
            });
          }
          return;
        }
        if (!token) {
          setPhase({ kind: 'error', message: 'This page needs the link from your email or from the organization that sent you here.' });
          return;
        }
        const session = await callHttpFunction<{ token: string }, Session & { ok: boolean }>('getConsentSession', { token });
        if (!cancelled) {
          setDirectoryListing(session.current.directory_listed);
          setShareDetails(session.current.shares_details);
          setPhase({ kind: 'ready', session });
        }
      } catch (error: any) {
        if (!cancelled) setPhase({ kind: 'error', message: error?.message || 'This link could not be opened.' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isDemo, token]);

  const submit = async (declined: boolean) => {
    if (phase.kind !== 'ready') return;
    setSubmitError('');
    setIsSubmitting(true);
    try {
      if (isDemo) {
        setPhase({ kind: 'done', result: declined ? 'declined' : 'accepted', returnUrl: null, returnsTo: null });
        return;
      }
      const response = await callHttpFunction<object, { ok: boolean; return_url: string | null }>(
        'consentAccept',
        declined
          ? { token, declined: true }
          : {
              token,
              consent: {
                agreed: true,
                terms_hash: phase.session.terms.terms_hash,
                directory_listing: directoryListing,
                share_details: shareDetails,
              },
            }
      );
      setPhase({ kind: 'done', result: declined ? 'declined' : 'accepted', returnUrl: response.return_url, returnsTo: phase.session.returns_to });
    } catch (error: any) {
      setSubmitError(error?.message || 'Your choices could not be saved. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (phase.kind === 'done' && phase.returnUrl) {
      const id = window.setTimeout(() => { window.location.href = phase.returnUrl as string; }, 2500);
      return () => window.clearTimeout(id);
    }
  }, [phase]);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-10 text-gray-900">
      <div className="mx-auto w-full max-w-2xl">
        {isDemo && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            Preview — this is what an entrepreneur sees. Nothing you choose here is recorded.
          </div>
        )}

        {phase.kind === 'loading' && (
          <div className="rounded-2xl bg-white p-8 shadow-sm">Loading…</div>
        )}

        {phase.kind === 'error' && (
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h1 className="text-xl font-semibold">We couldn't open this link</h1>
            <p className="mt-2 text-gray-600">{phase.message}</p>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-semibold">{phase.result === 'accepted' ? 'Thank you — your choices are saved' : 'No problem'}</h1>
            <p className="mt-3 text-gray-700">
              {phase.result === 'accepted'
                ? 'You can change your directory listing and sharing choices at any time from your privacy settings, or by asking any organization you work with.'
                : 'Nothing more has been shared. The organization that sent you here still works with you as before.'}
            </p>
            {phase.returnUrl && (
              <p className="mt-6">
                <a href={phase.returnUrl} className={`inline-block rounded-lg px-5 py-2.5 font-semibold text-white ${BRAND}`}>
                  Return to {phase.returnsTo || 'the previous site'}
                </a>
                <span className="ml-3 text-sm text-gray-500">Taking you back automatically…</span>
              </p>
            )}
          </div>
        )}

        {phase.kind === 'ready' && (() => {
          const { session } = phase;
          const { summary, choices, documents } = session.terms;
          return (
            <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#8b1919]">{session.requested_by} invites you</p>
              <h1 className="mt-2 text-2xl font-semibold leading-tight sm:text-3xl">{summary.heading}</h1>
              <p className="mt-4 text-gray-700">
                {session.first_name && <span className="block font-medium text-gray-900">Hi {session.first_name},</span>}
                {summary.intro}
              </p>

              <div className="mt-6 space-y-3">
                <SummaryRow tone="always" title="Always shared, with organizations you work with" body={summary.always} />
                <SummaryRow tone="choice" title="Only if you choose" body={summary.choice} />
                <SummaryRow tone="never" title="Never shared" body={summary.never} />
              </div>

              <button
                type="button"
                onClick={() => setShowFullText((v) => !v)}
                className="mt-5 text-sm font-semibold text-[#8b1919] underline-offset-2 hover:underline"
                aria-expanded={showFullText}
              >
                {showFullText ? 'Hide the full terms' : 'Read the full terms'}
              </button>
              {showFullText && (
                <div className="mt-3 max-h-96 space-y-6 overflow-y-auto rounded-lg border border-gray-200 p-4">
                  {documents.map((docItem) => (
                    <section key={docItem.type}>
                      <h2 className="font-semibold">{docItem.title} <span className="text-xs font-normal text-gray-500">version {docItem.version}</span></h2>
                      {docItem.sections.map((section) => (
                        <div key={section.heading} className="mt-3">
                          <h3 className="text-sm font-semibold text-gray-800">{section.heading}</h3>
                          <p className="text-sm leading-6 text-gray-700">{section.body}</p>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )}

              <fieldset className="mt-8 space-y-4 border-t border-gray-100 pt-6">
                <legend className="sr-only">Your choices</legend>
                <Choice checked={agreed} onChange={setAgreed} label={choices.agree.label} required />
                <Choice checked={directoryListing} onChange={setDirectoryListing} label={choices.directory_listing.label} help={choices.directory_listing.help} />
                <Choice checked={shareDetails} onChange={setShareDetails} label={choices.share_details.label} help={choices.share_details.help} />
              </fieldset>

              {submitError && <p className="mt-4 text-sm text-red-700">{submitError}</p>}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={!agreed || isSubmitting}
                  onClick={() => void submit(false)}
                  className={`rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-40 ${BRAND}`}
                >
                  {isSubmitting ? 'Saving…' : 'Agree and save my choices'}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void submit(true)}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  No thanks
                </button>
              </div>
              <p className="mt-4 text-xs text-gray-500">
                Part of {session.network_name}. Organizations in the network have signed the same agreement about how your information is handled.
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

const SummaryRow = ({ tone, title, body }: { tone: 'always' | 'choice' | 'never'; title: string; body: string }) => {
  const marker = tone === 'always' ? '●' : tone === 'choice' ? '◐' : '○';
  return (
    <div className="flex gap-3 rounded-lg bg-stone-50 p-3">
      <span aria-hidden className="mt-0.5 text-[#8b1919]">{marker}</span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-gray-700">{body}</div>
      </div>
    </div>
  );
};

const Choice = ({ checked, onChange, label, help, required }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  help?: string;
  required?: boolean;
}) => (
  <label className="flex cursor-pointer items-start gap-3">
    <input
      type="checkbox"
      className="mt-1 h-4 w-4 accent-[#8b1919]"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span>
      <span className="text-sm font-medium text-gray-900">{label}{required && <span className="text-[#8b1919]"> *</span>}</span>
      {help && <span className="block text-xs text-gray-500">{help}</span>}
    </span>
  </label>
);
