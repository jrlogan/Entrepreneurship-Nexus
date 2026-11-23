"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerRefBuilder = void 0;
const providerRefBuilder = (provider, providerId) => (userinfoKey, id) => {
    const mapped = provider.ref_sources?.[userinfoKey];
    if (mapped && provider.organization_id) {
        return { source: mapped, id, owner_org_id: provider.organization_id };
    }
    return { source: mapped || `${providerId}:${userinfoKey}`, id };
};
exports.providerRefBuilder = providerRefBuilder;
