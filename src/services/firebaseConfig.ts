import type { FirebaseOptions } from 'firebase/app';

type ExtendedFirebaseOptions = FirebaseOptions & {
  databaseId?: string;
};

const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

const emulatorProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'entrepreneurship-nexus-local';

const emulatorConfig: ExtendedFirebaseOptions = {
  apiKey: 'local-only-api-key',
  authDomain: `${emulatorProjectId}.firebaseapp.com`,
  projectId: emulatorProjectId,
  storageBucket: `${emulatorProjectId}.appspot.com`,
  messagingSenderId: '000000000000',
  appId: `1:000000000000:web:${emulatorProjectId}`,
};

const envConfig: ExtendedFirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID,
};

export const hasFirebaseConfig = Boolean(
  useEmulators || (
    envConfig.apiKey &&
    envConfig.authDomain &&
    envConfig.projectId &&
    envConfig.appId
  )
);

export const firebaseConfig = useEmulators ? emulatorConfig : envConfig;
