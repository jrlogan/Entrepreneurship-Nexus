import { collection, doc, deleteDoc, getDoc, getDocs, query, setDoc, updateDoc, where, type QueryConstraint } from 'firebase/firestore';
import { getFirestoreDb } from './firebaseApp';

export const getCollection = (name: string) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  return collection(db, name);
};

export const getDocument = async <T>(collectionName: string, id: string): Promise<T | null> => {
  const db = getFirestoreDb();
  if (!db) {
    return null;
  }

  const snapshot = await getDoc(doc(db, collectionName, id));
  // Merge the document ID so callers always get a usable `id`, even for
  // collections whose bodies don't duplicate it (e.g. consent_policies).
  return snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as T) : null;
};

export const queryCollection = async <T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> => {
  const ref = getCollection(collectionName);
  const snapshot = await getDocs(constraints.length > 0 ? query(ref, ...constraints) : ref);
  // Merge the document ID so callers always get a usable `id`, even for
  // collections whose bodies don't duplicate it (e.g. consent_policies).
  return snapshot.docs.map((item) => ({ ...item.data(), id: item.id } as T));
};

export const whereEquals = (field: string, value: unknown) => where(field, '==', value);
export const whereNotEquals = (field: string, value: unknown) => where(field, '!=', value);

export const whereIn = (field: string, value: unknown[]) => where(field, 'array-contains-any', value);

export const setDocument = async <T>(collectionName: string, id: string, data: T, merge = true) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  // Firestore rejects undefined field values — strip them before writing
  const clean = Object.fromEntries(Object.entries(data as object).filter(([, v]) => v !== undefined));
  await setDoc(doc(db, collectionName, id), clean, { merge });
};

export const deleteDocument = async (collectionName: string, id: string) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }
  await deleteDoc(doc(db, collectionName, id));
};

export const updateDocument = async <T>(collectionName: string, id: string, data: Partial<T>) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  // Firestore rejects undefined field values — strip them before writing
  const clean = Object.fromEntries(Object.entries(data as object).filter(([, v]) => v !== undefined));
  await updateDoc(doc(db, collectionName, id), clean);
};
