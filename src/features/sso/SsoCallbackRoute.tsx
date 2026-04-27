import React, { useEffect, useState } from 'react';
import { SsoScreen } from './SsoScreen';
import { exchangeToken, linkAccount } from './ssoApi';
import { consumeFlow } from './pkce';
import { signInWithCustomFirebaseToken } from '../../services/authService';

/**
 * Handles /oauth/callback?code=...&state=... — finishes the PKCE flow.
 *
 * Flow:
 *   1. Read code + state from the URL.
 *   2. Look up the stashed verifier/redirect_uri under `state` in
 *      sessionStorage. If missing, the flow is stale (user refreshed the
 *      callback URL) or was tampered with — surface an error.
 *   3. POST { provider_id, code, code_verifier, redirect_uri } to
 *      oidcExchangeToken on the server. The server does the code→token
 *      exchange, dedup, provisioning, and returns a Firebase custom token.
 *   4. signInWithCustomToken() with the returned token.
 *   5. Strip the OAuth params from the URL and drop the user onto "/"
 *      (which, post-signin, shows the normal app — AgreementGate will then
 *      pick up any compact acceptance still needed).
 */
export const SsoCallbackRoute: React.FC = () => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const providerError = params.get('error');
      const providerErrorDescription = params.get('error_description');

      if (providerError) {
        setError(providerErrorDescription || `Sign-in was cancelled (${providerError}).`);
        return;
      }
      if (!code || !state) {
        setError('The sign-in link is missing required parameters.');
        return;
      }

      const stash = consumeFlow(state);
      if (!stash) {
        setError(
          "We couldn't find the sign-in request that started this. " +
          'This usually means the tab was refreshed after returning from your provider, ' +
          'or sign-in was started in a different browser. Please try again.'
        );
        return;
      }

      try {
        if (stash.intent === 'link') {
          // Link path: user is already authenticated; we just attach the
          // provider identity to their current Nexus person.
          await linkAccount({
            provider_id: stash.provider_id,
            code,
            code_verifier: stash.verifier,
            redirect_uri: stash.redirect_uri,
          });
          if (cancelled) return;
          // Land on the app root. The Linked Accounts section in settings
          // reflects the new state; the banner (if it was showing) will
          // stop showing for this provider.
          window.location.href = '/?linked=ok';
          return;
        }

        // Default login path.
        const result = await exchangeToken({
          provider_id: stash.provider_id,
          code,
          code_verifier: stash.verifier,
          redirect_uri: stash.redirect_uri,
        });
        await signInWithCustomFirebaseToken(result.firebase_token);
        if (cancelled) return;
        // Drop the OAuth query params and land on the app root. AuthProvider
        // + AgreementGate take over from here.
        window.history.replaceState({}, '', '/');
        window.location.href = '/';
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Could not complete sign-in.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <SsoScreen title="Sign-in could not complete" message={error} tone="error">
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
      title="Finishing sign-in…"
      message="Verifying your identity and preparing your profile."
    />
  );
};
