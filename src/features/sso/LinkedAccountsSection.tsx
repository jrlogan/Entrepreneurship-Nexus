import React, { useEffect, useState } from 'react';
import { fetchProviders, isPersonLinkedToProvider, type ProviderConfig } from './ssoApi';

type PersonExternalRef = { source: string; id: string };

type Props = {
  ecosystemId: string;
  personRefs: PersonExternalRef[];
};

/**
 * Renders a "Linked accounts" list for the current user's settings. For
 * each active OIDC provider in the current ecosystem, shows either
 * "Linked" or a "Connect [Provider]" button that navigates to
 * /sso/:providerId/link (the PKCE flow with link-intent).
 *
 * No state is persisted here — the displayed state is derived from the
 * caller-supplied person external_refs. Parent re-renders (e.g. after
 * returning from /?linked=ok) refresh this automatically.
 */
export const LinkedAccountsSection: React.FC<Props> = ({ ecosystemId, personRefs }) => {
  const [providers, setProviders] = useState<ProviderConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchProviders(ecosystemId);
        if (!cancelled) setProviders(list);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load linked-account options');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ecosystemId]);

  if (error) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (providers === null) {
    return <div className="text-sm text-slate-500">Loading linked-account options…</div>;
  }

  if (providers.length === 0) {
    return (
      <div className="text-sm text-slate-500">
        No external sign-in providers are configured for this ecosystem yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => {
        const linked = isPersonLinkedToProvider(provider, personRefs);
        return (
          <div
            key={provider.provider_id}
            className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {provider.logo_url && (
                <img
                  src={provider.logo_url}
                  alt=""
                  className="h-6 w-6 rounded object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {provider.display_name}
                </div>
                <div className="text-xs text-slate-500">
                  {linked
                    ? 'Your account is linked. Signing in with this provider will use this Nexus profile.'
                    : 'Not yet linked. Connect to enable one-click sign-in via this provider.'}
                </div>
              </div>
            </div>
            <div className="ml-4 flex-shrink-0">
              {linked ? (
                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  Linked
                </span>
              ) : (
                <a
                  href={`/sso/${encodeURIComponent(provider.provider_id)}/link`}
                  className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Connect {provider.display_name}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
