
export type ChangeAction = 'create' | 'update' | 'delete' | 'rollback';

export interface Revision<T> {
  id: string;
  entityId: string;
  timestamp: string; // ISO Date
  actor: {
    id: string;
    label: string; // e.g. "John Doe" or "API Key: Salesforce Sync"
    type: 'user' | 'api_key' | 'system';
  };
  action: ChangeAction;
  changesSummary?: string; // e.g. "Changed status from Active to Closed"
  snapshot: T; // The full state of the object at this point in time
}
