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

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { refsToMove, refsAfterUnmerge } from './recordMerge';

describe('refsToMove', () => {
  it('moves refs the winner does not already have', () => {
    const winner = [{ source: 'makehaven_civicrm', id: '1' }];
    const loser = [{ source: 'ef_tracker', id: '99' }];
    assert.deepEqual(refsToMove(winner, loser), [{ source: 'ef_tracker', id: '99' }]);
  });

  it('does not duplicate a ref both records already carry', () => {
    const shared = { source: 'ef_tracker', id: '42' };
    assert.deepEqual(refsToMove([shared], [shared]), []);
  });

  it('treats same id from different sources as distinct pointers', () => {
    const winner = [{ source: 'ef_tracker', id: '7' }];
    const loser = [{ source: 'ipfactory_matching', id: '7' }];
    assert.equal(refsToMove(winner, loser).length, 1);
  });

  it('deduplicates repeated refs within the loser', () => {
    const dup = { source: 'ef_tracker', id: '5' };
    assert.deepEqual(refsToMove([], [dup, dup]), [dup]);
  });

  it('skips malformed refs rather than moving a broken pointer', () => {
    const loser = [
      { source: '', id: '1' },
      { source: 'ok', id: '' },
      { source: 'ok', id: '2' },
    ] as any;
    assert.deepEqual(refsToMove([], loser), [{ source: 'ok', id: '2' }]);
  });

  it('handles empty inputs', () => {
    assert.deepEqual(refsToMove([], []), []);
  });
});

describe('refsAfterUnmerge', () => {
  it('removes exactly the refs that were moved', () => {
    const own = { source: 'makehaven_civicrm', id: '1' };
    const moved = { source: 'ef_tracker', id: '99' };
    assert.deepEqual(refsAfterUnmerge([own, moved], [moved]), [own]);
  });

  it("leaves the winner's own refs alone when nothing moved", () => {
    const own = [{ source: 'makehaven_civicrm', id: '1' }];
    assert.deepEqual(refsAfterUnmerge(own, []), own);
  });

  it('round-trips: merge then unmerge restores the winner exactly', () => {
    const winner = [{ source: 'makehaven_civicrm', id: '1' }];
    const loser = [
      { source: 'ef_tracker', id: '99' },
      { source: 'makehaven_civicrm', id: '1' }, // already on winner
    ];
    const moved = refsToMove(winner, loser);
    const afterMerge = [...winner, ...moved];
    assert.deepEqual(refsAfterUnmerge(afterMerge, moved), winner);
  });
});
