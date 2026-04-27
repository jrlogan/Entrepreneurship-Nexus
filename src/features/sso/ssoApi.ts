/**
 * Thin wrappers around the Nexus OIDC cloud functions for the client-side
 * SSO flow. Centralised so the route components stay UI-only.
 */

import { callHttpFunction } from '../../services/httpFunctionClient';

export type ProviderConfig = {
  provider_id: string;
  organization_id: string;
  ecosystem_id?: string;
  display_name: string;
  logo_url: string | null;
  authorization_endpoint: string;
  client_id: string;
  scopes: string[];
  /** Map of userinfo-key → external_ref.source, used to detect whether a
   *  user is already linked to this provider. */
  ref_sources: Record<string, string>;
};

type ProviderConfigResponse = {
  ok: true;
  provider: ProviderConfig;
};

type ProvidersListResponse = {
  ok: true;
  providers: ProviderConfig[];
};

export type TokenExchangeRequest = {
  provider_id: string;
  code: string;
  code_verifier: string;
  redirect_uri: string;
};

export type TokenExchangeResponse = {
  ok: true;
  firebase_token: string;
  nexus_id: string;
  is_new_account: boolean;
};

const getBaseUrl = (): string => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
  const region = (import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1').trim() || 'us-central1';
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    const host = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
    const port = import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || '55001';
    return `http://${host}:${port}/${projectId}/${region}`;
  }
  return `https://${region}-${projectId}.cloudfunctions.net`;
};

/**
 * Fetch a single provider's public config. Unlike callHttpFunction (which
 * POSTs and injects the current user's ID token), this uses a plain GET —
 * no authentication, no body.
 */
export const fetchProvider = async (providerId: string): Promise<ProviderConfig> => {
  const url = `${getBaseUrl()}/oidcGetProvider?provider_id=${encodeURIComponent(providerId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json && json.error) || `Could not load sign-in provider (${res.status})`;
    const err = new Error(message) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (json as ProviderConfigResponse).provider;
};

export const exchangeToken = (payload: TokenExchangeRequest): Promise<TokenExchangeResponse> =>
  callHttpFunction<TokenExchangeRequest, TokenExchangeResponse>('oidcExchangeToken', payload);

export type LinkAccountRequest = TokenExchangeRequest;

export type LinkAccountResponse = {
  ok: true;
  linked_refs: { source: string; id: string }[];
};

/**
 * Attach a provider identity to the currently-authenticated Nexus user.
 * Server endpoint requires a Firebase ID token (handled by callHttpFunction
 * automatically via the current user's ID token).
 */
export const linkAccount = (payload: LinkAccountRequest): Promise<LinkAccountResponse> =>
  callHttpFunction<LinkAccountRequest, LinkAccountResponse>('oidcLinkAccount', payload);

/**
 * List active OIDC providers for an ecosystem. Public metadata; safe to
 * call before authentication. Used by LinkedAccountsSection and
 * LinkedAccountBanner to decide which providers to offer.
 */
export const fetchProviders = async (ecosystemId: string): Promise<ProviderConfig[]> => {
  if (!ecosystemId) return [];
  const url = `${getBaseUrl()}/oidcGetProviders?ecosystem_id=${encodeURIComponent(ecosystemId)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  return ((json as ProvidersListResponse)?.providers || []);
};

/**
 * A person is considered linked to a provider when any of the provider's
 * configured ref_sources values appears in the person's external_refs.
 * Falls back to a provider-namespaced default (<provider_id>:<userinfo_key>)
 * because the server uses the same fallback when ref_sources is unset.
 */
export const isPersonLinkedToProvider = (
  provider: ProviderConfig,
  personRefs: { source: string; id: string }[] | undefined,
): boolean => {
  if (!personRefs || personRefs.length === 0) return false;
  const sources = new Set<string>();
  for (const key of Object.keys(provider.ref_sources || {})) {
    sources.add(provider.ref_sources[key]);
  }
  // Include fallback defaults the server writes when ref_sources is unset.
  for (const key of ['drupal_uid', 'civi_contact_id']) {
    sources.add(`${provider.provider_id}:${key}`);
  }
  return personRefs.some((r) => sources.has(r.source));
};
