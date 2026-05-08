
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { Organization } from '../../domain/types';
import {
  AGREEMENT_VERSIONS,
  ORG_REQUIRED_AGREEMENTS,
  type OrgAgreementAcceptance,
  type OrgAgreementType,
} from '../../domain/agreements/types';
import { computeTextHash, getContent, type AgreementContent } from '../../domain/agreements/content';
import { FirebaseOrgAgreementsRepo } from '../../data/repos/firebase/orgAgreements';
import { ALL_ECOSYSTEMS } from '../../data/mockData';
import { Card, Modal } from '../../shared/ui/Components';
import { useAuthContext } from '../../app/AuthProvider';
import { useViewer } from '../../data/AppDataContext';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const orgAgreementsRepo = new FirebaseOrgAgreementsRepo();

interface Props {
  org: Organization;
}

interface SignatureRow {
  ecosystemId: string;
  ecosystemName: string;
  agreementType: OrgAgreementType;
  signature: OrgAgreementAcceptance | null;
  needsRefresh: boolean; // signed but stale version
}

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export const OrgCompactSignatures: React.FC<Props> = ({ org }) => {
  const viewer = useViewer();
  const { session } = useAuthContext();
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<{ ecosystemId: string; ecosystemName: string; type: OrgAgreementType } | null>(null);

  const ecosystemEntries = useMemo(() => {
    return (org.ecosystem_ids || [])
      .map((id) => ({ id, name: ALL_ECOSYSTEMS.find((e) => e.id === id)?.name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [org.ecosystem_ids]);

  const loadSignatures = useCallback(async () => {
    if (!isFirebaseEnabled()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const all = await orgAgreementsRepo.getForOrg(org.id);
      const next: SignatureRow[] = [];
      for (const eco of ecosystemEntries) {
        for (const type of ORG_REQUIRED_AGREEMENTS) {
          const sig = all.find(
            (s) => s.ecosystem_id === eco.id && s.agreement_type === type && !s.revoked_at,
          ) ?? null;
          const needsRefresh = !!sig && sig.version !== AGREEMENT_VERSIONS[type];
          next.push({
            ecosystemId: eco.id,
            ecosystemName: eco.name,
            agreementType: type,
            signature: sig,
            needsRefresh,
          });
        }
      }
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [org.id, ecosystemEntries]);

  useEffect(() => {
    void loadSignatures();
  }, [loadSignatures]);

  const handleSigned = useCallback(() => {
    setSigning(null);
    void loadSignatures();
  }, [loadSignatures]);

  if (ecosystemEntries.length === 0) {
    return (
      <Card title="Network Compact Signatures">
        <p className="text-sm text-gray-600">
          This organization is not currently enrolled in any ecosystem. Compact signatures appear here once it is added to one.
        </p>
      </Card>
    );
  }

  if (!isFirebaseEnabled()) {
    return (
      <Card title="Network Compact Signatures">
        <p className="text-sm text-gray-600">
          Compact signing is only available in deployed environments (Firebase backend). In demo mode, signatures are not persisted.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card title="Network Compact Signatures">
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <p className="font-semibold mb-1">Tier-2 federation requires a current org-level signature.</p>
            <p>
              Sign on behalf of <strong>{org.name}</strong> to participate in each ecosystem's federation. Cross-ESO data sharing in that ecosystem depends on a current signature for both the network compact and the data usage agreement.
            </p>
          </div>

          {loading && <p className="text-sm text-gray-500">Loading signatures…</p>}

          {!loading && ecosystemEntries.map((eco) => (
            <div key={eco.id} className="rounded border border-gray-200 bg-white">
              <div className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">
                {eco.name}
              </div>
              <div className="divide-y divide-gray-100">
                {ORG_REQUIRED_AGREEMENTS.map((type) => {
                  const row = rows.find((r) => r.ecosystemId === eco.id && r.agreementType === type);
                  const content = getContent(type);
                  const sig = row?.signature ?? null;
                  const needsRefresh = row?.needsRefresh ?? false;
                  return (
                    <div key={type} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">{content.title}</div>
                        {sig ? (
                          <div className="text-xs text-gray-500">
                            Signed by <span className="text-gray-700 font-medium">{sig.signed_by_name}</span> · v{sig.version} · {formatDate(sig.signed_at)}
                            {needsRefresh && (
                              <span className="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                Re-sign required (v{AGREEMENT_VERSIONS[type]})
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-rose-600 font-medium">Not yet signed</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSigning({ ecosystemId: eco.id, ecosystemName: eco.name, type })}
                        className={`px-3 py-1.5 text-xs font-semibold rounded ${
                          sig && !needsRefresh
                            ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        }`}
                      >
                        {sig && !needsRefresh ? 'Review / Re-sign' : 'Review & Sign'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {signing && session.authUser && (
        <SignCompactModal
          org={org}
          ecosystemId={signing.ecosystemId}
          ecosystemName={signing.ecosystemName}
          agreementType={signing.type}
          authUid={session.authUser.uid}
          authDisplayName={session.authUser.displayName || session.authUser.email || 'Unknown signer'}
          signerPersonId={viewer.personId}
          signerRole={viewer.role}
          onCancel={() => setSigning(null)}
          onSigned={handleSigned}
        />
      )}
    </>
  );
};

// ─── Signing modal ────────────────────────────────────────────────────────────

interface SignCompactModalProps {
  org: Organization;
  ecosystemId: string;
  ecosystemName: string;
  agreementType: OrgAgreementType;
  authUid: string;
  authDisplayName: string;
  signerPersonId: string;
  signerRole: ReturnType<typeof useViewer>['role'];
  onCancel: () => void;
  onSigned: () => void;
}

const SignCompactModal: React.FC<SignCompactModalProps> = ({
  org,
  ecosystemId,
  ecosystemName,
  agreementType,
  authUid,
  authDisplayName,
  signerPersonId,
  signerRole,
  onCancel,
  onSigned,
}) => {
  const content: AgreementContent = getContent(agreementType);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    if (!agreed) return;
    setSubmitting(true);
    setError(null);
    try {
      const textHash = await computeTextHash(content);
      await orgAgreementsRepo.sign({
        orgId: org.id,
        ecosystemId,
        agreementType,
        textHash,
        signedByUid: authUid,
        signedByPersonId: signerPersonId,
        signedByName: authDisplayName,
        signedByRole: signerRole,
      });
      onSigned();
    } catch {
      setError('Could not record the signature. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onCancel} title={`Sign for ${org.name} — ${ecosystemName}`} wide>
      <div className="space-y-4">
        <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${content.badgeColor}`}>
          {content.badge} · v{AGREEMENT_VERSIONS[agreementType]}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">{content.title}</h2>

        <div className="rounded border border-gray-200 divide-y divide-gray-100 max-h-80 overflow-y-auto">
          {content.sections.map((s) => (
            <div key={s.heading} className="px-4 py-3">
              <div className="text-sm font-semibold text-gray-900 mb-1">{s.heading}</div>
              <div className="text-sm text-gray-700 leading-6">{s.body}</div>
            </div>
          ))}
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 space-y-2">
          <div>
            Signing as: <span className="font-semibold text-gray-900">{authDisplayName}</span>
            <span className="text-xs text-gray-500"> · role: {signerRole}</span>
          </div>
          <div className="text-xs text-gray-500">
            Your name, role, and the timestamp will be recorded on the signature for this ecosystem.
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="text-sm text-gray-800">
            I am authorized to sign this agreement on behalf of <strong>{org.name}</strong> and bind this organization to its terms within <strong>{ecosystemName}</strong>.
          </span>
        </label>

        {error && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSign()}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
            disabled={!agreed || submitting}
          >
            {submitting ? 'Recording…' : 'Sign on behalf of organization'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
