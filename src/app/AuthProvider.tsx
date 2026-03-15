import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { subscribeToAuth } from '../services/authService';
import { initFirebase, isFirebaseEnabled } from '../services/firebaseApp';
import type { AuthSession } from '../domain/auth/session';

const defaultSession: AuthSession = {
  authUser: null,
  person: null,
  memberships: [],
  activeEcosystemId: null,
  activeOrgId: null,
  viewer: null,
  status: 'loading',
};

interface AuthContextValue {
  session: AuthSession;
  setResolvedSession: (next: Partial<AuthSession>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [session, setSession] = useState<AuthSession>(() =>
    isFirebaseEnabled() ? defaultSession : { ...defaultSession, status: 'disabled' }
  );

  useEffect(() => {
    if (!isFirebaseEnabled()) {
      setSession(prev => ({ ...prev, status: 'disabled' }));
      return;
    }

    initFirebase();
    const unsubscribe = subscribeToAuth((user) => {
      setAuthResolved(true);
      setAuthUser(user);
      setSession(prev => ({
        ...prev,
        authUser: user,
        status: user
          ? (prev.person && prev.viewer ? 'authenticated' : 'loading')
          : 'unauthenticated',
      }));
    });

    return unsubscribe;
  }, []);

  const setResolvedSession = useCallback((next: Partial<AuthSession>) => {
    setSession(prev => {
      const merged: AuthSession = {
        ...prev,
        ...next,
        authUser,
      };

      if (!authResolved) {
        merged.status = isFirebaseEnabled() ? 'loading' : 'disabled';
      } else if (!authUser) {
        merged.status = isFirebaseEnabled() ? 'unauthenticated' : 'disabled';
      } else if (merged.person && merged.viewer) {
        merged.status = 'authenticated';
      } else {
        merged.status = 'needs_profile';
      }

      return merged;
    });
  }, [authResolved, authUser]);

  const value = useMemo<AuthContextValue>(() => ({ session, setResolvedSession }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }

  return context;
};
