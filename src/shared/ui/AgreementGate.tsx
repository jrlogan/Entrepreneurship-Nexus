
import React, { useState } from 'react';
import type { AgreementType } from '../../domain/agreements/types';
import { computeTextHash, getContent } from '../../domain/agreements/content';
import { FirebaseAgreementsRepo } from '../../data/repos/firebase/agreements';

const agreementsRepo = new FirebaseAgreementsRepo();

// ─── Component ────────────────────────────────────────────────────────────────

interface AgreementGateProps {
  agreementType: AgreementType;
  authUid: string;
  personId: string;
  ecosystemId: string;
  ecosystemName?: string;
  onAccepted: () => void;
}

export const AgreementGate: React.FC<AgreementGateProps> = ({
  agreementType,
  authUid,
  personId,
  ecosystemId,
  ecosystemName,
  onAccepted,
}) => {
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = getContent(agreementType);

  const handleAccept = async () => {
    if (!agreed) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const textHash = await computeTextHash(content);
      await agreementsRepo.recordAcceptance(
        authUid,
        personId,
        ecosystemId,
        agreementType,
        'post_login_gate',
        textHash,
      );
      onAccepted();
    } catch {
      setError('Unable to record your acceptance. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 text-white flex items-start justify-center p-6">
      <div className="w-full max-w-2xl py-8">
        <div className="mb-6 flex flex-col gap-3">
          <div className={`inline-flex self-start rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${content.badgeColor}`}>
            {content.badge}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {content.title}
          </h1>
          {ecosystemName && (
            <p className="text-sm text-slate-400">
              Required before accessing <strong className="text-slate-200">{ecosystemName}</strong>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10">
          {content.sections.map((section) => (
            <div key={section.heading} className="px-6 py-5">
              <div className="text-sm font-semibold text-white mb-1">{section.heading}</div>
              <div className="text-sm text-slate-300 leading-6">{section.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-800 text-indigo-500 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-sm text-slate-200 group-hover:text-white transition-colors">
              {content.checkLabel}
            </span>
          </label>

          {error && (
            <div className="rounded border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          <button
            onClick={() => void handleAccept()}
            disabled={!agreed || isSubmitting}
            className="w-full rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Recording acceptance…' : 'I agree — continue to workspace'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Inline agreement checkbox (for signup / invite forms) ────────────────────

interface AgreementCheckboxProps {
  agreementType: AgreementType;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const AgreementCheckbox: React.FC<AgreementCheckboxProps> = ({
  agreementType,
  checked,
  onChange,
}) => {
  const isPrivacy = agreementType === 'privacy_policy';
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
      />
      <span className="text-xs text-slate-600 leading-5">
        {isPrivacy
          ? 'I understand how my venture data will be used and shared within this ecosystem as described in the '
          : 'I agree to the data access responsibilities and confidentiality obligations described in the '}
        <button
          type="button"
          onClick={() => {
            // Future: open a modal with full text. For now, agreement is shown on the gate after login.
          }}
          className="underline text-indigo-600 hover:text-indigo-800"
        >
          {isPrivacy ? 'Privacy Notice' : 'Data Usage Agreement'}
        </button>
        .
      </span>
    </label>
  );
};
