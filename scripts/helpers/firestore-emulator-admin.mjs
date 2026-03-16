import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const admin = require('../../functions/node_modules/firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';
const host = process.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';
const port = process.env.VITE_FIRESTORE_EMULATOR_PORT || '58080';

process.env.FIRESTORE_EMULATOR_HOST = `${host}:${port}`;
process.env.GCLOUD_PROJECT = projectId;

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const db = admin.firestore();

export const getAdminDocument = async (collectionId, documentId) => {
  const snapshot = await db.collection(collectionId).doc(documentId).get();
  if (!snapshot.exists) {
    return null;
  }

  return {
    id: snapshot.id,
    fields: snapshot.data() || {},
  };
};

export const listAdminDocuments = async (collectionId) => {
  const snapshot = await db.collection(collectionId).get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    fields: doc.data() || {},
  }));
};
