
import React, { useEffect, useState } from 'react';
import type { Organization } from '../../domain/types';
import { COMPACT_SUMMARY, getContent, type AgreementContent } from '../../domain/agreements/content';
import {
  AGREEMENT_VERSIONS,
  type OrgAgreementType,
} from '../../domain/agreements/types';
import {
  getViewerSignatureStatus,
  isHardEnforcementActive,
  type ViewerSignatureStatus,
} from '../../domain/agreements/orgEnforcement';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { Modal } from '../../shared/ui/Components';
import { useViewer } from '../../data/AppDataContext';

interface Props {
  subjectOrg: Organization;
}

const isEsoStaffRole = (role: string): boolean =>
  role === 'eso_staff' || role === 'eso_admin' || role === 'eso_coach' || role === 'ecosystem_manager' || role === 'platform_admin';

export const ConsortiumBanner: React.FC<Props> = ({ subjectOrg }) => {
  const viewer = useViewer();
  const [status, setStatus] = useState<ViewerSignatureStatus | null>(null);
  const [viewing, setViewing] = useState<OrgAgreementType | null>(null);

  // Only show to ESO staff/admins viewing operational data on a different
  // org. Entrepreneurs and own-org views are handled by other surfaces.
  const isOwnOrg = subjectOrg.id === viewer.orgId;
  const showForRole = isEsoStaffRole(viewer.role);

  useEffect(() => {
    let cancelled = false;
    if (!showForRole || isOwnOrg || !viewer.orgId || !viewer.ecosystemId) {
      setStatus(null);
      return;
    }
    void getViewerSignatureStatus({
      viewerOrgId: viewer.orgId,
      ecosystemId: viewer.ecosystemId,
    }).then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => { cancelled = true; };
  }, [showForRole, isOwnOrg, viewer.orgId, viewer.ecosystemId]);

  if (!showForRole || isOwnOrg) return null;

  const ecosystemName = ALL_ECOSYSTEMS.find((e) => e.id === viewer.ecosystemId)?.name || 'this ecosystem';
  const enforcementActive = isHardEnforcementActive();

  const hasGap = !!status && !status.signed;
  const isDraft = status?.isDraftPhase ?? true;

  // Tone:
  // - hasGap + enforcementActive  → red, blocking-style (informational only today; future hard gate)
  // - hasGap + draft phase        → amber warning ("will be required at v1.0")
  // - signed                      → neutral indigo summary
  // - no status (loading / N/A)   → neutral summary, no badge
  let toneClasses = 'border-indigo-200 bg-indigo-50';
  let textClasses = 'text-indigo-900';
  let mutedTextClasses = 'text-indigo-800';
  let badge: { label: string; classes: string } | null = null;

  if (hasGap && enforcementActive) {
    toneClasses = 'border-rose-300 bg-rose-50';
    textClasses = 'text-rose-900';
    mutedTextClasses = 'text-rose-800';
    badge = { label: 'Compact signature required', classes: 'bg-rose-200 text-rose-900' };
  } else if (hasGap && isDraft) {
    toneClasses = 'border-amber-300 bg-amber-50';
    textClasses = 'text-amber-900';
    mutedTextClasses = 'text-amber-800';
    badge = { label: 'Compact unsigned (advisory)', classes: 'bg-amber-200 text-amber-900' };
  } else if (status?.signed) {
    badge = { label: 'Compact signed', classes: 'bg-emerald-200 text-emerald-900' };
  }

  const missingLabels = (status?.missingTypes ?? []).map((t) => getContent(t).title).join(', ');
  const staleLabels = (status?.staleTypes ?? []).map((t) => getContent(t).title).join(', ');

  return (
    <>
      <div className={`mb-4 rounded-lg border ${toneClasses} px-4 py-3`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`text-sm font-semibold ${textClasses} flex items-center gap-2 flex-wrap`}>
              <span>You are viewing data outside your organization.</span>
              {badge && (
                <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.classes}`}>
                  {badge.label}
                </span>
              )}
            </div>
            <ul className={`mt-1 list-disc pl-5 text-xs ${mutedTextClasses} space-y-0.5`}>
              {COMPACT_SUMMARY.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {hasGap && (
              <div className={`mt-2 text-xs ${mutedTextClasses}`}>
                {missingLabels && <span><strong>{viewer.orgId === subjectOrg.id ? 'Your' : 'Your organization'}</strong> has not signed: <strong>{missingLabels}</strong> for {ecosystemName}. </span>}
                {staleLabels && <span>Re-sign required (newer version) for: <strong>{staleLabels}</strong>. </span>}
                {enforcementActive
                  ? <span>Operational data access will be blocked until a current signature is on file.</span>
                  : <span>Once the network compact reaches v1.0, operational data access will require a current signature. (Currently advisory.)</span>}
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setViewing('federation_compact')}
              className={`text-xs font-semibold underline ${textClasses} hover:opacity-80`}
            >
              View Network Compact
            </button>
            <button
              type="button"
              onClick={() => setViewing('data_usage_agreement')}
              className={`text-xs font-semibold underline ${textClasses} hover:opacity-80`}
            >
              View Data Usage Agreement
            </button>
          </div>
        </div>
      </div>

      {viewing && (
        <AgreementViewerModal
          agreementType={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  );
};

const AgreementViewerModal: React.FC<{ agreementType: OrgAgreementType; onClose: () => void }> = ({ agreementType, onClose }) => {
  const content: AgreementContent = getContent(agreementType);
  return (
    <Modal isOpen={true} onClose={onClose} title={`${content.title} — v${AGREEMENT_VERSIONS[agreementType]}`} wide>
      <div className="space-y-3">
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${content.badgeColor}`}>
          {content.badge}
        </div>
        <div className="rounded border border-gray-200 divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
          {content.sections.map((s) => (
            <div key={s.heading} className="px-4 py-3">
              <div className="text-sm font-semibold text-gray-900 mb-1">{s.heading}</div>
              <div className="text-sm text-gray-700 leading-6">{s.body}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 border rounded text-sm hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
};
