"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPersonCreatedNotifyConsent = void 0;
/**
 * The consent notice for people staff add by hand.
 *
 * A partner with no system of its own records clients directly in Nexus
 * (People → Add). Nobody is added to the network without being told, so
 * this trigger does for those people what partnerUpsertPerson does for
 * people pushed through the API: sends the consent notice — one per
 * person, network and organization — with the link to make their choices.
 * People created by the API are skipped (the API already sent it).
 */
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-functions/v2/firestore");
const partnerApi_1 = require("../partnerApi");
exports.onPersonCreatedNotifyConsent = (0, firestore_1.onDocumentCreated)('people/{personId}', async (event) => {
    const data = event.data?.data();
    if (!data)
        return;
    if (data.system_role !== 'entrepreneur' || data.source === 'partner_api')
        return;
    const orgId = data.created_by_org_id;
    const ecosystemId = data.ecosystem_id;
    const email = data.email?.trim();
    if (!orgId || !ecosystemId || !email)
        return;
    await (0, partnerApi_1.ensureConsentNotice)(admin.firestore(), event.params.personId, data.first_name || '', email, ecosystemId, orgId);
});
