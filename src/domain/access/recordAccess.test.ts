import { describe, it, expect } from 'vitest';
import { isOwnRecord, notesHidden, detailsHidden } from './recordAccess';

describe('record access tiers', () => {
  it('treats records without a tier as your own', () => {
    expect(isOwnRecord({})).toBe(true);
    expect(notesHidden({})).toBe(false);
  });

  it('hides notes on every partner record, consented or not', () => {
    expect(notesHidden({ _access: 'detail' })).toBe(true);
    expect(notesHidden({ _access: 'fact' })).toBe(true);
    expect(notesHidden({ _access: 'full' })).toBe(false);
  });

  it('hides details only without consent', () => {
    expect(detailsHidden({ _access: 'fact' })).toBe(true);
    expect(detailsHidden({ _access: 'detail' })).toBe(false);
  });
});
