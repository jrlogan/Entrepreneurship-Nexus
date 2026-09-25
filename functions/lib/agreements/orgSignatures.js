"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgSignatureStatus = exports.evaluateOrgSignatures = void 0;
const content_1 = require("./content");
/** Pure: classify signature docs against the versions required for the organization's tier. */
const evaluateOrgSignatures = (signatures, tier = 'member') => {
    const missing = (0, content_1.requiredAgreementsFor)(tier).filter((type) => !signatures.some((sig) => sig.agreement_type === type && sig.version === content_1.AGREEMENT_VERSIONS[type] && !sig.revoked_at));
    return { signed: missing.length === 0, missing: [...missing], tier };
};
exports.evaluateOrgSignatures = evaluateOrgSignatures;
const getOrgSignatureStatus = async (db, orgId, ecosystemId) => {
    const tier = (0, content_1.membershipTierOf)((await db.collection('organizations').doc(orgId).get()).data());
    const refs = (0, content_1.requiredAgreementsFor)(tier).map((type) => db.collection('org_agreement_acceptances').doc(`${orgId}_${ecosystemId}_${type}`));
    const snaps = await db.getAll(...refs);
    return (0, exports.evaluateOrgSignatures)(snaps.filter((snap) => snap.exists).map((snap) => snap.data() || {}), tier);
};
exports.getOrgSignatureStatus = getOrgSignatureStatus;
