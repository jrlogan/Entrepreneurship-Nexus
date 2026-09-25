"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgSignatureStatus = exports.evaluateOrgSignatures = void 0;
const content_1 = require("./content");
/** Pure: classify signature docs against the required versions. */
const evaluateOrgSignatures = (signatures) => {
    const missing = content_1.ORG_REQUIRED_AGREEMENTS.filter((type) => !signatures.some((sig) => sig.agreement_type === type && sig.version === content_1.AGREEMENT_VERSIONS[type] && !sig.revoked_at));
    return { signed: missing.length === 0, missing: [...missing] };
};
exports.evaluateOrgSignatures = evaluateOrgSignatures;
const getOrgSignatureStatus = async (db, orgId, ecosystemId) => {
    const refs = content_1.ORG_REQUIRED_AGREEMENTS.map((type) => db.collection('org_agreement_acceptances').doc(`${orgId}_${ecosystemId}_${type}`));
    const snaps = await db.getAll(...refs);
    return (0, exports.evaluateOrgSignatures)(snaps.filter((snap) => snap.exists).map((snap) => snap.data() || {}));
};
exports.getOrgSignatureStatus = getOrgSignatureStatus;
