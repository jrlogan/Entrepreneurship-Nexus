/**
 * How much of a record the viewer was given by the network view
 * (functions/src/privacy/policy.ts):
 *
 *   full   — your own organization's record, notes included.
 *   detail — a partner's record the entrepreneur let you see; no notes.
 *   fact   — a partner's record without consent: who, what kind, when.
 *
 * Records created locally in the session carry no tier and are your own.
 */
export type RecordAccessTier = 'full' | 'detail' | 'fact';

export interface HasRecordAccess {
  _access?: RecordAccessTier;
}

export const isOwnRecord = (record: HasRecordAccess): boolean =>
  !record._access || record._access === 'full';

/** Notes never leave the organization that wrote them. */
export const notesHidden = (record: HasRecordAccess): boolean => !isOwnRecord(record);

/** Program names, outcomes and similar details need the entrepreneur's consent. */
export const detailsHidden = (record: HasRecordAccess): boolean => record._access === 'fact';
