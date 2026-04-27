/**
 * PKCE helpers for the federated OIDC flow.
 *
 * RFC 7636: a cryptographically random verifier (43–128 chars of the
 * unreserved set) is stored client-side, and its SHA-256 hash (base64url-
 * encoded, no padding) is sent as the challenge when redirecting the user
 * to the provider's authorization endpoint. On return, the server-side
 * oidcExchangeToken function forwards the verifier to the provider's token
 * endpoint to prove this is the same client that started the flow.
 *
 * Storage note: we use sessionStorage (not localStorage) so the verifier
 * dies with the tab. Cross-tab carry-over would only help a weird flow
 * where the user starts SSO in tab A and finishes in tab B — not a case
 * worth supporting at the cost of a longer-lived secret.
 */

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

const randomChars = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += UNRESERVED[bytes[i] % UNRESERVED.length];
  }
  return out;
};

const base64UrlEncode = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const createVerifier = (): string => randomChars(128);

export const challengeFor = async (verifier: string): Promise<string> => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
};

export const randomState = (): string => randomChars(32);

// ── Session storage helpers (keyed per-flow by state, to tolerate the rare
// case of concurrent in-flight flows in different windows) ──────────────────

const KEY = (state: string) => `nexus.sso.pkce.${state}`;

export type FlowIntent = 'login' | 'link';

export type StashedFlow = {
  provider_id: string;
  verifier: string;
  redirect_uri: string;
  intent: FlowIntent;
  created_at: number;
};

export const stashFlow = (state: string, flow: StashedFlow): void => {
  sessionStorage.setItem(KEY(state), JSON.stringify(flow));
};

export const consumeFlow = (state: string): StashedFlow | null => {
  const raw = sessionStorage.getItem(KEY(state));
  if (!raw) return null;
  sessionStorage.removeItem(KEY(state));
  try {
    return JSON.parse(raw) as StashedFlow;
  } catch {
    return null;
  }
};
