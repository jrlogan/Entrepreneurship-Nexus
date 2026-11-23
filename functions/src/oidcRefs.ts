/**
 * External refs carried by an SSO identity (oidcExchangeToken, oidcLinkAccount).
 *
 * A provider's `ref_sources` maps a userinfo key to the `external_ref.source`
 * its organization already uses in the partner API — the provider is
 * declaring "this key is in my partner ID scheme". Such a ref is that
 * organization's own identifier, so it carries `owner_org_id` and resolves
 * through the owner-scoped external_ref_index entry the partner API wrote
 * ("{entityType}:{ownerOrgId}:{source}:{id}", see externalRefIndex.ts).
 * Without the owner, SSO could never Tier-1-match a record the same
 * organization pushed, and created duplicates.
 *
 * An unmapped key falls back to a provider-namespaced source
 * (`<provider_id>:<key>`) with no owner — global, exactly as before.
 */
import type { ExternalRef } from './federationDedup';

export interface ProviderRefConfig {
  organization_id: string;
  ref_sources?: Record<string, string>;
}

export const providerRefBuilder = (provider: ProviderRefConfig, providerId: string) =>
  (userinfoKey: string, id: string): ExternalRef => {
    const mapped = provider.ref_sources?.[userinfoKey];
    if (mapped && provider.organization_id) {
      return { source: mapped, id, owner_org_id: provider.organization_id };
    }
    return { source: mapped || `${providerId}:${userinfoKey}`, id };
  };
