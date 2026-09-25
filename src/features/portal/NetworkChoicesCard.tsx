import React, { useEffect, useState } from 'react';
import { Card } from '../../shared/ui/Components';
import { useRepos, useViewer } from '../../data/AppDataContext';
import type { NetworkChoices } from '../../data/repos/networkProfiles';

/**
 * The founder's two network choices, per network — the same two offered on
 * the consent page and in partners' signup forms (directory on by default,
 * details off). Whatever they choose, notes are never shared and
 * organizations that do not work with them see nothing beyond the listing.
 */
export const NetworkChoicesCard = ({
  networks,
  onChange,
}: {
  networks: { id: string; name: string }[];
  onChange?: () => void;
}) => {
  const repos = useRepos();
  const viewer = useViewer();
  const [ecosystemId, setEcosystemId] = useState(viewer.ecosystemId);
  const [choices, setChoices] = useState<NetworkChoices | null>(null);
  const [busy, setBusy] = useState<keyof NetworkChoices | null>(null);
  const [error, setError] = useState('');
  const networkName = networks.find((n) => n.id === ecosystemId)?.name || 'this network';

  useEffect(() => {
    let cancelled = false;
    setChoices(null);
    repos.networkProfiles.getChoices(viewer.personId, ecosystemId)
      .then((next) => { if (!cancelled) setChoices(next); })
      .catch(() => { if (!cancelled) setChoices({ directoryListed: false, sharesDetails: false, withdrawn: false }); });
    return () => { cancelled = true; };
  }, [repos, viewer.personId, ecosystemId]);

  const set = async (choice: keyof NetworkChoices, on: boolean) => {
    setBusy(choice);
    setError('');
    try {
      await repos.networkProfiles.setChoice(viewer.personId, ecosystemId, choice, on);
      setChoices((prev) => (prev ? { ...prev, [choice]: on } : prev));
      repos.networkView.invalidate();
      onChange?.();
    } catch {
      setError('Could not save that choice. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Your network choices" className="border-t-4 border-t-[#8b1919]">
      <div className="space-y-4">
        {networks.length > 1 && (
          <select
            aria-label="Network these choices apply to"
            value={ecosystemId}
            onChange={(e) => setEcosystemId(e.target.value)}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {networks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        <p className="text-sm text-gray-600">
          Organizations you work with in {networkName} see your name and that other partners are helping you; they get your
          email only once they accept a referral for you. These two choices are yours. Notes staff write are never shared.
        </p>
        <ChoiceRow
          title="List me in the network directory"
          description="Support organizations you have not worked with yet can find you — your name and venture, never your contact details. They reach you through a referral."
          checked={!!choices?.directoryListed}
          disabled={!choices || busy !== null || !!choices?.withdrawn}
          onChange={(on) => void set('directoryListed', on)}
        />
        <ChoiceRow
          title="Share record details with every partner I work with"
          description="Partners already working with you can see the details of each other's records — such as program names and referral outcomes. You can also choose partners one by one below."
          checked={!!choices?.sharesDetails}
          disabled={!choices || busy !== null || !!choices?.withdrawn}
          onChange={(on) => void set('sharesDetails', on)}
        />
        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className={`rounded border p-3 ${choices?.withdrawn ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
          {choices?.withdrawn ? (
            <>
              <div className="text-sm font-semibold text-amber-900">You have left {networkName}.</div>
              <p className="mt-1 text-xs text-amber-900">
                Nothing about you is shared between organizations here, and you are not listed. The organizations you work with
                still work with you and keep their own records, exactly as before.
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void set('withdrawn', false)}
                className="mt-2 rounded border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40"
              >
                Rejoin {networkName}
              </button>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-gray-900">Leave {networkName}</div>
              <p className="mt-1 text-xs text-gray-600">
                Leaving the network does not end your relationship with any organization. Each one you work with keeps
                working with you and keeps its own records. What stops is sharing between them: nothing about you crosses
                from one organization to another, not even that you met, and you are not listed in the directory. You can rejoin at any time.
              </p>
              <button
                type="button"
                disabled={!choices || busy !== null}
                onClick={() => { if (window.confirm(`Leave ${networkName}? Your relationships with individual organizations are not affected.`)) void set('withdrawn', true); }}
                className="mt-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:opacity-40"
              >
                Leave this network
              </button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
};

const ChoiceRow = ({ title, description, checked, disabled, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-4 rounded border border-gray-200 bg-white p-3">
    <div>
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-600">{description}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors disabled:opacity-40 ${checked ? 'bg-[#8b1919]' : 'bg-gray-300'}`}
    >
      <span aria-hidden className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  </div>
);
