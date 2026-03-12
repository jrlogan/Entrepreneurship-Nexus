import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  User,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth } from './firebaseApp';

export type AuthStatus = 'disabled' | 'loading' | 'authenticated' | 'unauthenticated';

export const subscribeToAuth = (callback: (user: User | null) => void) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }

  return onAuthStateChanged(auth, callback);
};

export const signInWithGoogle = async () => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase auth is not configured.');
  }

  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithEmail = async (email: string, password: string) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase auth is not configured.');
  }

  return signInWithEmailAndPassword(auth, email, password);
};

export const createUserWithEmail = async (email: string, password: string, displayName?: string) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase auth is not configured.');
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential;
};

export const signOutUser = async () => {
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }

  return signOut(auth);
};

export const sendPasswordReset = async (email: string) => {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase auth is not configured.');
  }

  return sendPasswordResetEmail(auth, email);
};
