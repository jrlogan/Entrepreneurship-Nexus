import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, type QueryConstraint } from 'firebase/firestore';
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
  return snapshot.exists() ? (snapshot.data() as T) : null;
};

export const queryCollection = async <T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> => {
  const ref = getCollection(collectionName);
  const snapshot = await getDocs(constraints.length > 0 ? query(ref, ...constraints) : ref);
  return snapshot.docs.map((item) => item.data() as T);
};

export const whereEquals = (field: string, value: unknown) => where(field, '==', value);

export const whereIn = (field: string, value: unknown[]) => where(field, 'array-contains-any', value);

export const setDocument = async <T>(collectionName: string, id: string, data: T, merge = true) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  await setDoc(doc(db, collectionName, id), data as object, { merge });
};

export const updateDocument = async <T>(collectionName: string, id: string, data: Partial<T>) => {
  const db = getFirestoreDb();
  if (!db) {
    throw new Error('Firestore is not configured.');
  }

  await updateDoc(doc(db, collectionName, id), data as object);
};
