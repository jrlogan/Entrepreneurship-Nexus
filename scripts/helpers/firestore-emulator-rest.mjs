const DEFAULT_HOST = process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
const DEFAULT_PORT = process.env.VITE_FIRESTORE_EMULATOR_PORT || '58080';
const DEFAULT_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';

const getBaseUrl = () => `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

const fromFirestoreValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields || {}).map(([key, entry]) => [key, fromFirestoreValue(entry)])
    );
  }
  return null;
};

const fromFirestoreDocument = (doc) => ({
  name: doc.name,
  id: doc.name.split('/').pop(),
  fields: Object.fromEntries(
    Object.entries(doc.fields || {}).map(([key, value]) => [key, fromFirestoreValue(value)])
  ),
});

export const flushFirestoreEmulator = async (projectId = DEFAULT_PROJECT_ID) => {
  const response = await fetch(`${getBaseUrl()}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to flush Firestore emulator (${response.status}): ${text}`);
  }
};

export const getDocument = async (collectionId, documentId, projectId = DEFAULT_PROJECT_ID) => {
  const response = await fetch(`${getBaseUrl()}/v1/projects/${projectId}/databases/(default)/documents/${collectionId}/${documentId}`);
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to fetch ${collectionId}/${documentId} (${response.status}): ${text}`);
  }

  const json = await response.json();
  return fromFirestoreDocument(json);
};

export const listDocuments = async (collectionId, projectId = DEFAULT_PROJECT_ID) => {
  const response = await fetch(`${getBaseUrl()}/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`);
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to list ${collectionId} (${response.status}): ${text}`);
  }

  const json = await response.json();
  return (json.documents || []).map(fromFirestoreDocument);
};
