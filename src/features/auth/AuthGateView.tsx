import React, { useEffect, useMemo, useState } from 'react';
import type { Ecosystem, InviteSummary, Organization } from '../../domain/types';
import { FirebaseAuthPanel } from '../../shared/ui/FirebaseAuthPanel';
import { createUserWithEmail, sendPasswordReset, signInWithEmail, signInWithGoogle, signOutUser } from '../../services/authService';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { CONFIG } from '../../app/config';

interface AuthGateViewProps {
  status: 'loading' | 'unauthenticated' | 'needs_profile';
  authUserEmail?: string | null;
  authUid?: string | null; // kept for future use (e.g. invite token binding)
  organizations: Organization[];
  ecosystems: Ecosystem[];
}

type SignupFormState = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  ecosystem_id: string;
  note: string;
};

type SignInFormState = {
  email: string;
  password: string;
};

const defaultMessage = 'Sign in to access shared network data, inbound referral intake, and partner coordination workflows.';

export const AuthGateView: React.FC<AuthGateViewProps> = ({
  status,
  authUserEmail,
  organizations,
  ecosystems,
}) => {
  const [inviteSummary, setInviteSummary] = useState<InviteSummary | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [signInForm, setSignInForm] = useState<SignInFormState>({
    email: authUserEmail || '',
    password: '',
  });
  const inviteToken = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return new URLSearchParams(window.location.search).get('invite') || '';
  }, []);
  const defaultEcosystemId = ecosystems[0]?.id || '';
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    first_name: '',
    last_name: '',
    email: authUserEmail || '',
    password: '',
    ecosystem_id: defaultEcosystemId,
    note: '',
  });

  useEffect(() => {
    setSignupForm((current) => ({
      ...current,
      email: authUserEmail || current.email,
      ecosystem_id: current.ecosystem_id || defaultEcosystemId,
    }));
    setSignInForm((current) => ({
      ...current,
      email: authUserEmail || current.email,
    }));
  }, [authUserEmail, defaultEcosystemId]);

  useEffect(() => {
    if (!inviteToken) {
      setInviteSummary(null);
      return;
    }

    let cancelled = false;
    const loadInvite = async () => {
      try {
        const summary = await callHttpFunction<{ token: string }, InviteSummary>('getInviteSummary', { token: inviteToken });
        if (!cancelled) {
          setInviteSummary(summary);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load invite.');
        }
      }
    };

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const ecosystemOptions = useMemo(() => ecosystems.map((ecosystem) => (
    <option key={ecosystem.id} value={ecosystem.id}>{ecosystem.name}</option>
  )), [ecosystems]);

  const handleCreateEntrepreneurAccount = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!signupForm.first_name.trim() || !signupForm.last_name.trim() || !signupForm.email.trim() || !signupForm.password) {
        throw new Error('First name, last name, email, and password are required.');
      }

      const credential = await createUserWithEmail(
        signupForm.email.trim(),
        signupForm.password,
        `${signupForm.first_name.trim()} ${signupForm.last_name.trim()}`.trim()
      );

      await callHttpFunction('completeSelfSignup', {
        ecosystem_id: signupForm.ecosystem_id,
        first_name: signupForm.first_name.trim(),
        last_name: signupForm.last_name.trim(),
        note: signupForm.note.trim(),
      });

      if (inviteToken) {
        await callHttpFunction('acceptInvite', { token: inviteToken });
      }

      setSuccess('Account created. Reloading your workspace.');
      window.location.href = inviteToken ? '/' : '/';
      void credential;
    } catch (err: any) {
      setError(err?.message || 'Unable to create entrepreneur account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!signInForm.email.trim() || !signInForm.password) {
        throw new Error('Email and password are required.');
      }
      await signInWithEmail(signInForm.email.trim(), signInForm.password);
      setSuccess('Signed in. Loading your workspace.');
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await signInWithGoogle();
      // Auto-complete signup so Google users are never stuck at the profile screen.
      // Uses merge:true on the backend, so existing profiles are not overwritten.
      try {
        await callHttpFunction('completeSelfSignup', {
          ecosystem_id: signupForm.ecosystem_id || defaultEcosystemId,
        });
      } catch {
        // If auto-signup fails (e.g. emulator not running) the needs_profile
        // screen will show the manual form as a fallback — not a fatal error.
      }
      if (inviteToken) {
        try {
          await callHttpFunction('acceptInvite', { token: inviteToken });
        } catch { /* non-fatal */ }
      }
      setSuccess('Signed in. Loading your workspace.');
      window.location.href = '/';
    } catch (err: any) {
      setError(err?.message || 'Unable to sign in with Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (!signInForm.email.trim()) {
        throw new Error('Enter your email first.');
      }
      await sendPasswordReset(signInForm.email.trim());
      setSuccess(`Password reset email sent to ${signInForm.email.trim()}.`);
    } catch (err: any) {
      setError(err?.message || 'Unable to send password reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteSelfSignup = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await callHttpFunction('completeSelfSignup', {
        ecosystem_id: signupForm.ecosystem_id,
        first_name: signupForm.first_name.trim(),
        last_name: signupForm.last_name.trim(),
        note: signupForm.note.trim(),
      });

      if (inviteToken) {
        await callHttpFunction('acceptInvite', { token: inviteToken });
      }

      setSuccess('Profile completed. Reloading your workspace.');
      window.location.href = inviteToken ? '/' : '/';
    } catch (err: any) {
      setError(err?.message || 'Unable to complete signup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteToken) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await callHttpFunction('acceptInvite', { token: inviteToken });
      setSuccess('Invite accepted. Reloading your workspace.');
      window.location.href = '/';
    } catch (err: any) {
      setError(err?.message || 'Unable to accept invite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Protected Workspace
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Entrepreneurship Nexus</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                {status === 'needs_profile'
                  ? 'You are signed in, but this account does not have an active Nexus membership yet.'
                  : defaultMessage}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Default signup</div>
                <div className="mt-1 text-sm text-slate-300">Open signup creates a person with entrepreneur access by default.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Role elevation</div>
                <div className="mt-1 text-sm text-slate-300">ESO and admin roles are granted by invite or promotion only.</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Auditability</div>
                <div className="mt-1 text-sm text-slate-300">Invites, approvals, and membership changes should be traceable.</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/30">
            <FirebaseAuthPanel />
            <div className="space-y-4 px-6 py-6 text-sm text-slate-700">
              {inviteSummary && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900">
                  Invitation detected for <strong>{inviteSummary.email}</strong> as <strong>{inviteSummary.invited_role}</strong>.
                </div>
              )}

              {status === 'loading' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">Checking your session.</div>
              )}

              {status === 'unauthenticated' && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    Sign in with an existing account, or create a new entrepreneur account below.
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 text-base font-semibold text-slate-900">Sign In</div>
                    <div className="grid gap-3">
                      <input
                        className="rounded border border-slate-300 px-3 py-2"
                        placeholder="Email"
                        value={signInForm.email}
                        onChange={(event) => setSignInForm({ ...signInForm, email: event.target.value })}
                      />
                      <input
                        className="rounded border border-slate-300 px-3 py-2"
                        type="password"
                        placeholder="Password"
                        value={signInForm.password}
                        onChange={(event) => setSignInForm({ ...signInForm, password: event.target.value })}
                      />
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleSignIn} disabled={isSubmitting}>
                        Sign in
                      </button>
                      <button className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:opacity-50" onClick={handleForgotPassword} disabled={isSubmitting}>
                        Forgot password
                      </button>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs text-slate-400">or</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <button
                      className="mt-4 flex w-full items-center justify-center gap-3 rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      onClick={handleGoogleSignIn}
                      disabled={isSubmitting}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
                    </button>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 text-base font-semibold text-slate-900">Create Entrepreneur Account</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="First name" value={signupForm.first_name} onChange={(event) => setSignupForm({ ...signupForm, first_name: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="Last name" value={signupForm.last_name} onChange={(event) => setSignupForm({ ...signupForm, last_name: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" placeholder="Email" value={signupForm.email} onChange={(event) => setSignupForm({ ...signupForm, email: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" type="password" placeholder="Password" value={signupForm.password} onChange={(event) => setSignupForm({ ...signupForm, password: event.target.value })} />
                      <select className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={signupForm.ecosystem_id} onChange={(event) => setSignupForm({ ...signupForm, ecosystem_id: event.target.value })}>
                        {ecosystemOptions}
                      </select>
                      <textarea className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" rows={3} placeholder="Optional note about your company or goals" value={signupForm.note} onChange={(event) => setSignupForm({ ...signupForm, note: event.target.value })} />
                    </div>
                    <button className="mt-4 rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleCreateEntrepreneurAccount} disabled={isSubmitting}>
                      {inviteToken ? 'Create account and accept invite' : 'Create entrepreneur account'}
                    </button>
                  </div>
                </>
              )}

              {status === 'needs_profile' && (
                <>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
                    <div className="font-medium">Almost there — just a couple more details.</div>
                    <div className="mt-1 text-sm">Signed in as <strong>{authUserEmail}</strong>. Tell us your name to activate your account.</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 text-base font-semibold text-slate-900">Complete Your Profile</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="First name" value={signupForm.first_name} onChange={(event) => setSignupForm({ ...signupForm, first_name: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="Last name" value={signupForm.last_name} onChange={(event) => setSignupForm({ ...signupForm, last_name: event.target.value })} />
                      <select className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={signupForm.ecosystem_id} onChange={(event) => setSignupForm({ ...signupForm, ecosystem_id: event.target.value })}>
                        {ecosystemOptions}
                      </select>
                      <textarea className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" rows={2} placeholder="Optional: your business or goals" value={signupForm.note} onChange={(event) => setSignupForm({ ...signupForm, note: event.target.value })} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleCompleteSelfSignup} disabled={isSubmitting}>
                        {inviteToken ? 'Complete signup and accept invite' : 'Enter the Nexus'}
                      </button>
                      {inviteToken && (
                        <button className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:opacity-50" onClick={handleAcceptInvite} disabled={isSubmitting}>
                          Accept invite only
                        </button>
                      )}
                      <button className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-500 text-sm disabled:opacity-50" onClick={() => void handleSignOut()} disabled={isSubmitting}>
                        Sign out
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">ESO staff access is granted by invite. Once you are inside, you can request elevated access from your profile settings.</p>
                  </div>
                </>
              )}

              {(error || success) && (
                <div className={`rounded-xl px-4 py-3 ${error ? 'border border-rose-200 bg-rose-50 text-rose-900' : 'border border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
                  {error || success}
                </div>
              )}

              {CONFIG.IS_DEMO_MODE && (
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <div className="font-medium text-slate-900">Local login</div>
                  <div className="mt-2 space-y-1 font-mono text-xs text-slate-600">
                    <div>Email: coach@makehaven.org</div>
                    <div>Password: Password123!</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
