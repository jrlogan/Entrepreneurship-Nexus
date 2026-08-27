"use strict";
/**
 * Unit tests for the pure parts of record merge/unmerge.
 *
 * These cover the ref bookkeeping, which is what decides whether a partner
 * keeps its pointer through a merge and gets it back on an unmerge. The
 * transactional Firestore behaviour is covered by the emulator integration
 * suite.
 *
 * Run: node --require tsx/cjs --test src/recordMerge.test.ts
 */
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
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert/strict"));
const recordMerge_1 = require("./recordMerge");
(0, node_test_1.describe)('refsToMove', () => {
    (0, node_test_1.it)('moves refs the winner does not already have', () => {
        const winner = [{ source: 'makehaven_civicrm', id: '1' }];
        const loser = [{ source: 'ef_tracker', id: '99' }];
        assert.deepEqual((0, recordMerge_1.refsToMove)(winner, loser), [{ source: 'ef_tracker', id: '99' }]);
    });
    (0, node_test_1.it)('does not duplicate a ref both records already carry', () => {
        const shared = { source: 'ef_tracker', id: '42' };
        assert.deepEqual((0, recordMerge_1.refsToMove)([shared], [shared]), []);
    });
    (0, node_test_1.it)('treats same id from different sources as distinct pointers', () => {
        const winner = [{ source: 'ef_tracker', id: '7' }];
        const loser = [{ source: 'ipfactory_matching', id: '7' }];
        assert.equal((0, recordMerge_1.refsToMove)(winner, loser).length, 1);
    });
    (0, node_test_1.it)('deduplicates repeated refs within the loser', () => {
        const dup = { source: 'ef_tracker', id: '5' };
        assert.deepEqual((0, recordMerge_1.refsToMove)([], [dup, dup]), [dup]);
    });
    (0, node_test_1.it)('skips malformed refs rather than moving a broken pointer', () => {
        const loser = [
            { source: '', id: '1' },
            { source: 'ok', id: '' },
            { source: 'ok', id: '2' },
        ];
        assert.deepEqual((0, recordMerge_1.refsToMove)([], loser), [{ source: 'ok', id: '2' }]);
    });
    (0, node_test_1.it)('handles empty inputs', () => {
        assert.deepEqual((0, recordMerge_1.refsToMove)([], []), []);
    });
});
(0, node_test_1.describe)('refsAfterUnmerge', () => {
    (0, node_test_1.it)('removes exactly the refs that were moved', () => {
        const own = { source: 'makehaven_civicrm', id: '1' };
        const moved = { source: 'ef_tracker', id: '99' };
        assert.deepEqual((0, recordMerge_1.refsAfterUnmerge)([own, moved], [moved]), [own]);
    });
    (0, node_test_1.it)("leaves the winner's own refs alone when nothing moved", () => {
        const own = [{ source: 'makehaven_civicrm', id: '1' }];
        assert.deepEqual((0, recordMerge_1.refsAfterUnmerge)(own, []), own);
    });
    (0, node_test_1.it)('round-trips: merge then unmerge restores the winner exactly', () => {
        const winner = [{ source: 'makehaven_civicrm', id: '1' }];
        const loser = [
            { source: 'ef_tracker', id: '99' },
            { source: 'makehaven_civicrm', id: '1' }, // already on winner
        ];
        const moved = (0, recordMerge_1.refsToMove)(winner, loser);
        const afterMerge = [...winner, ...moved];
        assert.deepEqual((0, recordMerge_1.refsAfterUnmerge)(afterMerge, moved), winner);
    });
});
