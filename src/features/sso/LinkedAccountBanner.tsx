import React, { useEffect, useState } from 'react';
import { fetchProviders, isPersonLinkedToProvider, type ProviderConfig } from './ssoApi';

type PersonExternalRef = { source: string; id: string };

type Props = {
  ecosystemId: string;
  personRefs: PersonExternalRef[];
};

/**
 * Shows a dismissible banner encouraging the user to link their external
 * provider account(s), if any active OIDC providers in the current
 * ecosystem are NOT yet linked to the current person.
 *
 * Dismissal is per-provider and stored in localStorage so a user who
 * actively declined isn't nagged every page load. If they later link via
 * settings, the banner stops showing regardless of the dismissal flag.
 */

const dismissKey = (providerId: string) => `nexus.link.banner.dismissed.${providerId}`;

const isDismissed = (providerId: string): boolean => {
  try {
    return localStorage.getItem(dismissKey(providerId)) === '1';
  } catch {
    return false;
  }
};

const markDismissed = (providerId: string): void => {
  try {
    localStorage.setItem(dismissKey(providerId), '1');
  } catch {
    // localStorage may be blocked; treat as per-session dismiss then.
  }
};

export const LinkedAccountBanner: React.FC<Props> = ({ ecosystemId, personRefs }) => {
  const [providers, setProviders] = useState<ProviderConfig[] | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchProviders(ecosystemId);
      if (!cancelled) setProviders(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [ecosystemId]);

  if (!providers || providers.length === 0) return null;

  // Show the first provider that is unlinked AND not dismissed. We only
  // surface one at a time to avoid a stack of banners.
  const candidate = providers.find(
    (p) => !isPersonLinkedToProvider(p, personRefs) && !dismissedIds.has(p.provider_id) && !isDismissed(p.provider_id),
  );
  if (!candidate) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm"
      role="status"
    >
      <div className="flex-1 min-w-0 text-indigo-900">
        <div className="font-semibold">
          Link your {candidate.display_name} account
        </div>
        <div className="mt-0.5 text-indigo-800">
          Already a {candidate.display_name} member? Linking lets you sign in with one click
          and keeps your profile connected across the network.
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href={`/sso/${encodeURIComponent(candidate.provider_id)}/link`}
          className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Link account
        </a>
        <button
          type="button"
          onClick={() => {
            markDismissed(candidate.provider_id);
            setDismissedIds((prev) => {
              const next = new Set(prev);
              next.add(candidate.provider_id);
              return next;
            });
          }}
          className="text-xs font-medium text-indigo-700 hover:text-indigo-900 underline"
          aria-label="Dismiss linked-account suggestion"
        >
          Not now
        </button>
      </div>
    </div>
  );
};
