import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore, initializeFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { FirebaseStorage, connectStorageEmulator, getStorage } from 'firebase/storage';
import { firebaseConfig, hasFirebaseConfig } from './firebaseConfig';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let storage: FirebaseStorage | null = null;
let emulatorsConnected = false;

const shouldUseEmulators = () => import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

const getEmulatorHost = () => import.meta.env.VITE_FIREBASE_EMULATOR_HOST || '127.0.0.1';

export const isFirebaseEnabled = () => hasFirebaseConfig;

export const initFirebase = () => {
  if (!hasFirebaseConfig) {
    return null;
  }

  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  }

  if (!auth) {
    auth = getAuth(app);
  }

  if (!db) {
    const databaseId = shouldUseEmulators() ? undefined : firebaseConfig.databaseId;
    if (databaseId) {
      try {
        db = initializeFirestore(app, {}, databaseId);
      } catch {
        db = getFirestore(app, databaseId);
      }
    } else {
      db = getFirestore(app);
    }
  }

  if (!functions) {
    functions = getFunctions(app);
  }

  if (!storage) {
    storage = getStorage(app);
  }

  if (shouldUseEmulators() && !emulatorsConnected) {
    const host = getEmulatorHost();
    const authPort = parseInt(import.meta.env.VITE_AUTH_EMULATOR_PORT || '59099', 10);
    const firestorePort = parseInt(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || '58080', 10);
    const functionsPort = parseInt(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || '55001', 10);
    const storagePort = parseInt(import.meta.env.VITE_STORAGE_EMULATOR_PORT || '59199', 10);

    if (!(auth as any)._emulatorConfig) {
      connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
    }

    try {
      connectFirestoreEmulator(db, host, firestorePort);
    } catch {
      // Ignore repeated emulator connection attempts during HMR.
    }

    try {
      connectFunctionsEmulator(functions, host, functionsPort);
    } catch {
      // Ignore repeated emulator connection attempts during HMR.
    }

    try {
      connectStorageEmulator(storage, host, storagePort);
    } catch {
      // Ignore repeated emulator connection attempts during HMR.
    }

    emulatorsConnected = true;
  }

  return { app, auth, db, functions, storage };
};

export const getFirebaseApp = () => initFirebase()?.app ?? null;
export const getFirebaseAuth = () => initFirebase()?.auth ?? null;
export const getFirestoreDb = () => initFirebase()?.db ?? null;
export const getFunctionsClient = () => initFirebase()?.functions ?? null;
export const getStorageClient = () => initFirebase()?.storage ?? null;
