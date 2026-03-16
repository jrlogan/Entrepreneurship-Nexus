import React, { useState } from 'react';
import { sendPasswordReset, signInWithEmail, signInWithGoogle, signOutUser } from '../../services/authService';
import { isFirebaseEnabled } from '../../services/firebaseApp';
import { useAuthSession } from '../../app/useAuthSession';
import { CONFIG } from '../../app/config';

export const FirebaseAuthPanel = () => {
  const session = useAuthSession();
  const [email, setEmail] = useState('coach@makehaven.org');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isFirebaseEnabled() || (!CONFIG.IS_DEMO_MODE && !CONFIG.FEATURES.SHOW_FIREBASE_PANEL)) {
    return null;
  }

  const handleEmailSignIn = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in with Google.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSignOut = async () => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await signOutUser();
    } catch (err: any) {
      setError(err?.message || 'Unable to sign out.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    const targetEmail = session.authUser?.email || email;
    if (!targetEmail) {
      setError('Email is required to send a password reset.');
      return;
    }

    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendPasswordReset(targetEmail);
      setMessage(`Password reset email sent to ${targetEmail}.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to send password reset email.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-indigo-50 px-4 py-3 text-xs text-gray-700">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="font-medium">
          Firebase session:
          <span className="ml-2 rounded bg-white px-2 py-1 font-mono text-[11px] text-indigo-700 border border-indigo-100">
            {session.status}
          </span>
          {session.authUser?.email && (
            <span className="ml-2 text-gray-600">{session.authUser.email}</span>
          )}
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          {!session.authUser && (
            <>
              <input
                data-testid="firebase-panel-email"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
              />
              <input
                data-testid="firebase-panel-password"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <button
                data-testid="firebase-panel-sign-in"
                className="rounded bg-indigo-600 px-3 py-1 font-medium text-white disabled:opacity-50"
                onClick={handleEmailSignIn}
                disabled={isBusy}
              >
                Sign In
              </button>
              <button
                className="rounded border border-indigo-200 bg-white px-3 py-1 font-medium text-indigo-700 disabled:opacity-50"
                onClick={handleGoogleSignIn}
                disabled={isBusy}
              >
                Google
              </button>
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 disabled:opacity-50"
                onClick={handlePasswordReset}
                disabled={isBusy}
              >
                Reset Password
              </button>
            </>
          )}
          {session.authUser && (
            <>
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 disabled:opacity-50"
                onClick={handlePasswordReset}
                disabled={isBusy}
              >
                Reset Password
              </button>
              <button
                data-testid="firebase-panel-sign-out"
                className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 disabled:opacity-50"
                onClick={handleSignOut}
                disabled={isBusy}
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div className="mt-2 text-red-600">{error}</div>}
      {message && <div className="mt-2 text-green-700">{message}</div>}
    </div>
  );
};
