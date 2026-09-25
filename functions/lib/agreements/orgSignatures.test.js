"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const orgSignatures_1 = require("./orgSignatures");
const content_1 = require("./content");
const sig = (type, version = content_1.AGREEMENT_VERSIONS[type]) => ({ agreement_type: type, version });
(0, node_test_1.describe)('what an organization must sign depends on its tier', () => {
    (0, node_test_1.it)('a member signs the membership terms, the compact and the data agreement', () => {
        const status = (0, orgSignatures_1.evaluateOrgSignatures)([sig('network_membership'), sig('federation_compact'), sig('data_usage_agreement')]);
        strict_1.default.equal(status.signed, true);
        strict_1.default.equal(status.tier, 'member');
        strict_1.default.equal((0, orgSignatures_1.evaluateOrgSignatures)([sig('network_membership'), sig('data_usage_agreement')]).signed, false);
    });
    (0, node_test_1.it)('a referral partner signs its own terms and the data agreement — the membership terms do not count', () => {
        strict_1.default.equal((0, orgSignatures_1.evaluateOrgSignatures)([sig('referral_partner_terms'), sig('data_usage_agreement')], 'referral_partner').signed, true);
        const wrongDocs = (0, orgSignatures_1.evaluateOrgSignatures)([sig('network_membership'), sig('federation_compact'), sig('data_usage_agreement')], 'referral_partner');
        strict_1.default.equal(wrongDocs.signed, false);
        strict_1.default.deepEqual(wrongDocs.missing, ['referral_partner_terms']);
    });
    (0, node_test_1.it)('an old version or a revoked signature does not count', () => {
        strict_1.default.equal((0, orgSignatures_1.evaluateOrgSignatures)([sig('referral_partner_terms', '0.0-pilot'), sig('data_usage_agreement')], 'referral_partner').signed, false);
        strict_1.default.equal((0, orgSignatures_1.evaluateOrgSignatures)([{ ...sig('referral_partner_terms'), revoked_at: '2026-09-25' }, sig('data_usage_agreement')], 'referral_partner').signed, false);
    });
});
