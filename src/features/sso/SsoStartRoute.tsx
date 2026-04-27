import React, { useEffect, useState } from 'react';
import { SsoScreen } from './SsoScreen';
import { fetchProvider } from './ssoApi';
import { challengeFor, createVerifier, randomState, stashFlow, type FlowIntent } from './pkce';

/**
 * Handles /sso/:providerId (intent: 'login') and /sso/:providerId/link
 * (intent: 'link'). Starts a PKCE authorization request against the named
 * OIDC provider. These routes are reached by partner-site buttons (login)
 * or in-app "Connect [Provider]" actions (link); they are NOT linked from
 * the default Nexus login screen.
 *
 * Flow:
 *   1. Fetch the provider's public config by id (no ecosystem needed).
 *   2. Generate PKCE verifier + challenge and a random state; stash the
 *      verifier + redirect_uri + intent under the state key in
 *      sessionStorage.
 *   3. Redirect the browser to the provider's authorize endpoint with
 *      scope, challenge, and state. The user authenticates there.
 *   4. Provider returns to /oauth/callback where SsoCallbackRoute reads
 *      the stashed intent and either signs the user in or attaches the
 *      provider identity to the already-authenticated user.
 */

type Props = { providerId: string; intent?: FlowIntent };

const buildAuthorizeUrl = (
  endpoint: string,
  params: Record<string, string>
): string => {
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
};

const resolveRedirectUri = (): string => {
  const configured = (import.meta.env.VITE_OAUTH_REDIRECT_URI as string | undefined)?.trim();
  if (configured) return configured;
  // Derive from current origin. The redirect URI must be registered on the
  // provider's OAuth consumer — any mismatch fails silently with a provider-
  // side redirect-loop, so we prefer the env value when set.
  return `${window.location.origin}/oauth/callback`;
};

export const SsoStartRoute: React.FC<Props> = ({ providerId, intent }) => {
  const resolvedIntent: FlowIntent = intent ?? 'login';
  const [error, setError] = useState<string | null>(null);
  const [providerName, setProviderName] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const provider = await fetchProvider(providerId);
        if (cancelled) return;
        setProviderName(provider.display_name);

        const verifier = createVerifier();
        const challenge = await challengeFor(verifier);
        const state = randomState();
        const redirectUri = resolveRedirectUri();

        stashFlow(state, {
          provider_id: providerId,
          verifier,
          redirect_uri: redirectUri,
          intent: resolvedIntent,
          created_at: Date.now(),
        });

        const authorizeUrl = buildAuthorizeUrl(provider.authorization_endpoint, {
          response_type: 'code',
          client_id: provider.client_id,
          redirect_uri: redirectUri,
          scope: provider.scopes.join(' '),
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state,
        });

        window.location.replace(authorizeUrl);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Could not start sign-in.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [providerId, resolvedIntent]);

  if (error) {
    return (
      <SsoScreen
        title="Sign-in unavailable"
        message={error}
        tone="error"
      >
        <a
          href="/"
          style={{ color: '#1a1a2e', fontSize: 14, textDecoration: 'underline' }}
        >
          Return to Nexus home
        </a>
      </SsoScreen>
    );
  }

  return (
    <SsoScreen
      title={providerName ? `Continuing to ${providerName}…` : 'Preparing sign-in…'}
      message="You'll be redirected to sign in. One moment."
    />
  );
};
