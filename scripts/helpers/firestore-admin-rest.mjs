import { execFileSync } from 'node:child_process';

const FIRESTORE_API_BASE = 'https://firestore.googleapis.com/v1';

const normalizeProjectId = (projectId) => {
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required.');
  }
  return projectId.trim();
};

export const getAccessToken = () => {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  if (!token) {
    throw new Error('Unable to get gcloud access token.');
  }
  return token;
};

const toFirestoreValue = (value) => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toFirestoreValue(entry)),
      },
    };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { integerValue: value.toString() };
    }
    return { doubleValue: value };
  }

  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, toFirestoreValue(entry)])
        ),
      },
    };
  }

  return { stringValue: String(value) };
};

const fromFirestoreValue = (value) => {
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

const request = async (projectId, path, init = {}) => {
  const token = getAccessToken();
  const response = await fetch(`${FIRESTORE_API_BASE}/projects/${normalizeProjectId(projectId)}/databases/(default)/documents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const setDocument = async (projectId, collectionId, documentId, data) => {
  const body = JSON.stringify({
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)])),
  });

  return request(projectId, `${collectionId}/${documentId}`, {
    method: 'PATCH',
    body,
  });
};

export const listDocuments = async (projectId, collectionId, pageToken) => {
  const params = new URLSearchParams({ pageSize: '200' });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const json = await request(projectId, `${collectionId}?${params.toString()}`);
  return {
    documents: (json.documents || []).map(fromFirestoreDocument),
    nextPageToken: json.nextPageToken || null,
  };
};

export const getAllDocuments = async (projectId, collectionId) => {
  const docs = [];
  let pageToken = null;
  do {
    const page = await listDocuments(projectId, collectionId, pageToken);
    docs.push(...page.documents);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return docs;
};

export const deleteDocumentByName = async (documentName) => {
  const token = getAccessToken();
  const response = await fetch(`${FIRESTORE_API_BASE}/${documentName}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete document ${documentName} (${response.status}): ${text}`);
  }
};
