
import React, { useState, useEffect, useRef } from 'react';
import { ENUMS } from '../../domain/standards/enums';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { FORM_INPUT_CLASS, FORM_LABEL_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from '../../shared/ui/Components';
import type { Organization, Person } from '../../domain/types';

interface ReferralFormViewProps {
  currentUser: Person;
  organizations: Organization[];
  onReferralCreated?: (referralId: string) => void;
}

interface FormState {
  ventureName: string;
  subjectOrgId: string;
  stage: string;
  supportNeeds: string[];
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  receivingOrgId: string;
  notes: string;
  allowIntroContact: boolean;
}

const readUrlParams = (): Partial<FormState> => {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const needs = p.get('needs');
  return {
    ventureName: p.get('venture') || '',
    stage: p.get('stage') || '',
    supportNeeds: needs ? needs.split(',').map(s => s.trim()).filter(Boolean) : [],
    website: p.get('website') || '',
    contactName: p.get('contact') || '',
    contactEmail: p.get('email') || '',
    receivingOrgId: p.get('to') || '',
    notes: p.get('notes') || '',
  };
};

export const ReferralFormView: React.FC<ReferralFormViewProps> = ({
  organizations,
  onReferralCreated,
}) => {
  const prefill = readUrlParams();

  const [form, setForm] = useState<FormState>({
    ventureName: prefill.ventureName || '',
    subjectOrgId: prefill.subjectOrgId || '',
    stage: prefill.stage || '',
    supportNeeds: prefill.supportNeeds || [],
    website: prefill.website || '',
    contactName: prefill.contactName || '',
    contactEmail: prefill.contactEmail || '',
    contactPhone: prefill.contactPhone || '',
    receivingOrgId: prefill.receivingOrgId || '',
    notes: prefill.notes || '',
    allowIntroContact: true,
  });

  const [orgSearchResults, setOrgSearchResults] = useState<Organization[]>([]);
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgInputRef = useRef<HTMLInputElement>(null);

  // ESO / partner orgs that can receive a referral
  const receivingOrgs = organizations.filter(
    (o) => o.roles?.includes('eso') || o.roles?.includes('funder') || o.roles?.includes('resource')
  );

  // Client-type orgs for subject search
  const clientOrgs = organizations.filter(
    (o) =>
      !o.roles?.includes('eso') &&
      !o.roles?.includes('funder') &&
      !o.roles?.includes('resource')
  );

  // Live search as user types venture name
  useEffect(() => {
    const q = form.ventureName.trim().toLowerCase();
    if (q.length < 2) {
      setOrgSearchResults([]);
      setShowOrgDropdown(false);
      return;
    }
    const matches = clientOrgs.filter((o) =>
      o.name.toLowerCase().includes(q)
    ).slice(0, 6);
    setOrgSearchResults(matches);
    setShowOrgDropdown(matches.length > 0 && !form.subjectOrgId);
  }, [form.ventureName, form.subjectOrgId]);

  const handleSelectOrg = (org: Organization) => {
    setForm((f) => ({
      ...f,
      ventureName: org.name,
      subjectOrgId: org.id,
      website: f.website || org.url || '',
      stage: f.stage || org.venture_stage || '',
    }));
    setShowOrgDropdown(false);
  };

  const handleVentureNameChange = (value: string) => {
    setForm((f) => ({ ...f, ventureName: value, subjectOrgId: '' }));
  };

  const toggleNeed = (id: string) => {
    setForm((f) => ({
      ...f,
      supportNeeds: f.supportNeeds.includes(id)
        ? f.supportNeeds.filter((n) => n !== id)
        : [...f.supportNeeds, id],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.ventureName.trim() && !form.subjectOrgId) {
      setError('Please enter a venture or company name.');
      return;
    }
    if (!form.receivingOrgId) {
      setError('Please select a receiving organization.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await callHttpFunction<Record<string, unknown>, { referral_id: string; subject_org_name: string }>('submitReferralForm', {
        venture_name: form.ventureName.trim(),
        subject_org_id: form.subjectOrgId || null,
        receiving_org_id: form.receivingOrgId,
        venture_stage: form.stage || null,
        support_needs: form.supportNeeds.length > 0 ? form.supportNeeds : null,
        contact_name: form.contactName.trim() || null,
        contact_email: form.contactEmail.trim() || null,
        contact_phone: form.contactPhone.trim() || null,
        website: form.website.trim() || null,
        notes: form.notes.trim() || null,
        allow_intro_contact: form.allowIntroContact,
      });

      const orgName = result.subject_org_name || form.ventureName;
      setSuccess(`Referral submitted for ${orgName}. The receiving organization will be notified.`);
      onReferralCreated?.(result.referral_id);

      // Reset form (keep receiving org for quick multi-submit)
      setForm((f) => ({
        ventureName: '',
        subjectOrgId: '',
        stage: '',
        supportNeeds: [],
        website: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        receivingOrgId: f.receivingOrgId,
        notes: '',
        allowIntroContact: true,
      }));
    } catch (err: any) {
      setError(err?.message || 'Failed to submit referral. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasPrefill = Object.values(prefill).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v)
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Make a Referral</h1>
        <p className="mt-1 text-sm text-gray-500">
          Use this form to formally refer a venture or business to another support organization.
        </p>
      </div>

      {/* URL pre-population callout */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        <strong>Tip:</strong> This form supports URL pre-population. Bookmark it with parameters like{' '}
        <code className="rounded bg-indigo-100 px-1 font-mono text-xs">?venture=Acme&amp;stage=early_revenue&amp;to=org123</code>{' '}
        to pre-fill fields automatically — useful for integration with external systems.
        {hasPrefill && (
          <span className="ml-2 font-semibold text-indigo-700">Fields pre-filled from URL.</span>
        )}
      </div>

      {success && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-medium">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        {/* Venture / Company */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Venture / Company</h2>
          <div className="space-y-4">
            <div className="relative">
              <label className={FORM_LABEL_CLASS}>
                Venture or Company Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={orgInputRef}
                type="text"
                className={FORM_INPUT_CLASS}
                placeholder="Type to search existing orgs or enter a new name…"
                value={form.ventureName}
                onChange={(e) => handleVentureNameChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowOrgDropdown(false), 150)}
                autoComplete="off"
              />
              {form.subjectOrgId && (
                <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                  <span className="font-semibold">✓ Matched to existing org in system</span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, subjectOrgId: '' }))}
                    className="ml-1 text-gray-400 hover:text-gray-600 underline"
                  >
                    clear
                  </button>
                </div>
              )}
              {!form.subjectOrgId && form.ventureName.trim().length >= 2 && orgSearchResults.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">No match in system — a new org record will be created on submit.</p>
              )}
              {showOrgDropdown && (
                <div className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-gray-400 bg-gray-50 font-bold">
                    Existing orgs in system
                  </div>
                  {orgSearchResults.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onMouseDown={() => handleSelectOrg(org)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium text-gray-900">{org.name}</div>
                      {org.venture_stage && (
                        <div className="text-xs text-gray-500">
                          {ENUMS.VentureStage.find((s) => s.id === org.venture_stage)?.label || org.venture_stage}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FORM_LABEL_CLASS}>Stage</label>
                <select
                  className={FORM_SELECT_CLASS}
                  value={form.stage}
                  onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}
                >
                  <option value="">Unknown / Not specified</option>
                  {ENUMS.VentureStage.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FORM_LABEL_CLASS}>Website</label>
                <input
                  type="url"
                  className={FORM_INPUT_CLASS}
                  placeholder="https://…"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Support Needs */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-2">Support Needs</h2>
          <p className="text-xs text-gray-500 mb-3">Select all that apply.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENUMS.SupportNeed.map((need) => (
              <label
                key={need.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors ${
                  form.supportNeeds.includes(need.id)
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800 font-medium'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={form.supportNeeds.includes(need.id)}
                  onChange={() => toggleNeed(need.id)}
                />
                <span
                  className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                    form.supportNeeds.includes(need.id)
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {form.supportNeeds.includes(need.id) && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
                      <path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {need.label}
              </label>
            ))}
          </div>
        </div>

        {/* Contact Info */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Entrepreneur Contact</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={FORM_LABEL_CLASS}>Contact Name</label>
              <input
                type="text"
                className={FORM_INPUT_CLASS}
                placeholder="Jane Smith"
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              />
            </div>
            <div>
              <label className={FORM_LABEL_CLASS}>Contact Email</label>
              <input
                type="email"
                className={FORM_INPUT_CLASS}
                placeholder="jane@example.com"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              />
            </div>
            <div>
              <label className={FORM_LABEL_CLASS}>Contact Phone</label>
              <input
                type="tel"
                className={FORM_INPUT_CLASS}
                placeholder="(555) 000-0000"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              />
            </div>
          </div>
          <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={form.allowIntroContact}
              onChange={(e) => setForm((f) => ({ ...f, allowIntroContact: e.target.checked }))}
              className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">
              The receiving org may contact the entrepreneur directly to introduce themselves.
            </span>
          </label>
        </div>

        {/* Referral Details */}
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-3">Referral Details</h2>
          <div className="space-y-4">
            <div>
              <label className={FORM_LABEL_CLASS}>
                Sending to <span className="text-red-500">*</span>
              </label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.receivingOrgId}
                onChange={(e) => setForm((f) => ({ ...f, receivingOrgId: e.target.value }))}
                required
              >
                <option value="">Select organization…</option>
                {receivingOrgs.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={FORM_LABEL_CLASS}>Notes</label>
              <textarea
                className={FORM_TEXTAREA_CLASS}
                rows={4}
                placeholder="Any additional context about why you're making this referral, what you've discussed with the entrepreneur, etc."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Submitting…' : 'Submit Referral'}
          </button>
          <p className="text-xs text-gray-500">
            The referral will appear in the receiving org's inbox.
          </p>
        </div>
      </form>
    </div>
  );
};
