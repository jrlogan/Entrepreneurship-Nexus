import React, { useEffect, useMemo, useState } from 'react';
import type { AccountRequest, Ecosystem, InviteSummary, Organization, SystemRole } from '../../domain/types';
import { FirebaseAuthPanel } from '../../shared/ui/FirebaseAuthPanel';
import { createUserWithEmail, sendPasswordReset, signInWithEmail } from '../../services/authService';
import { getDocument, setDocument } from '../../services/firestoreClient';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { CONFIG } from '../../app/config';

interface AuthGateViewProps {
  status: 'loading' | 'unauthenticated' | 'needs_profile';
  authUserEmail?: string | null;
  authUid?: string | null;
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

type AccessRequestFormState = {
  requested_role: SystemRole;
  requested_organization_id: string;
  requested_ecosystem_id: string;
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
  authUid,
  organizations,
  ecosystems,
}) => {
  const [request, setRequest] = useState<AccountRequest | null>(null);
  const [inviteSummary, setInviteSummary] = useState<InviteSummary | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(false);
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
  const defaultOrganizationId = organizations[0]?.id || '';
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    first_name: '',
    last_name: '',
    email: authUserEmail || '',
    password: 'Password123!',
    ecosystem_id: defaultEcosystemId,
    note: '',
  });
  const [accessRequestForm, setAccessRequestForm] = useState<AccessRequestFormState>({
    requested_role: 'eso_coach',
    requested_organization_id: defaultOrganizationId,
    requested_ecosystem_id: defaultEcosystemId,
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
    setAccessRequestForm((current) => ({
      ...current,
      requested_organization_id: current.requested_organization_id || defaultOrganizationId,
      requested_ecosystem_id: current.requested_ecosystem_id || defaultEcosystemId,
    }));
  }, [authUserEmail, defaultEcosystemId, defaultOrganizationId]);

  useEffect(() => {
    if (!authUid) {
      setRequest(null);
      return;
    }

    let cancelled = false;
    const loadRequest = async () => {
      setIsLoadingRequest(true);
      try {
        const existing = await getDocument<AccountRequest>('account_requests', authUid);
        if (!cancelled) {
          setRequest(existing);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRequest(false);
        }
      }
    };

    void loadRequest();
    return () => {
      cancelled = true;
    };
  }, [authUid]);

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

  const organizationOptions = useMemo(() => organizations.map((organization) => (
    <option key={organization.id} value={organization.id}>{organization.name}</option>
  )), [organizations]);

  const ecosystemOptions = useMemo(() => ecosystems.map((ecosystem) => (
    <option key={ecosystem.id} value={ecosystem.id}>{ecosystem.name}</option>
  )), [ecosystems]);

  const refreshRequest = async () => {
    if (!authUid) {
      return;
    }

    setIsLoadingRequest(true);
    setError(null);
    try {
      const existing = await getDocument<AccountRequest>('account_requests', authUid);
      setRequest(existing);
    } catch (err: any) {
      setError(err?.message || 'Unable to refresh request status.');
    } finally {
      setIsLoadingRequest(false);
    }
  };

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

  const submitElevatedAccessRequest = async () => {
    if (!authUid || !authUserEmail) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const now = new Date().toISOString();
      const nextRequest: AccountRequest = {
        id: authUid,
        auth_uid: authUid,
        email: authUserEmail.trim().toLowerCase(),
        first_name: signupForm.first_name.trim() || authUserEmail.split('@')[0],
        last_name: signupForm.last_name.trim() || 'User',
        requested_role: accessRequestForm.requested_role,
        requested_organization_id: accessRequestForm.requested_organization_id,
        requested_ecosystem_id: accessRequestForm.requested_ecosystem_id,
        status: 'pending',
        note: accessRequestForm.note.trim(),
        created_at: request?.created_at || now,
        updated_at: now,
      };
      await setDocument<AccountRequest>('account_requests', authUid, nextRequest, true);
      setRequest(nextRequest);
      setSuccess('Access request submitted. An admin must approve your elevated role.');
    } catch (err: any) {
      setError(err?.message || 'Unable to submit access request.');
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
                    Signed in as {authUserEmail}. Complete entrepreneur onboarding, or accept an invite for elevated access.
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 text-base font-semibold text-slate-900">Complete Entrepreneur Signup</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="First name" value={signupForm.first_name} onChange={(event) => setSignupForm({ ...signupForm, first_name: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="Last name" value={signupForm.last_name} onChange={(event) => setSignupForm({ ...signupForm, last_name: event.target.value })} />
                      <select className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={signupForm.ecosystem_id} onChange={(event) => setSignupForm({ ...signupForm, ecosystem_id: event.target.value })}>
                        {ecosystemOptions}
                      </select>
                      <textarea className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" rows={3} placeholder="Optional note about your company or goals" value={signupForm.note} onChange={(event) => setSignupForm({ ...signupForm, note: event.target.value })} />
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleCompleteSelfSignup} disabled={isSubmitting}>
                        {inviteToken ? 'Complete signup and accept invite' : 'Continue as entrepreneur'}
                      </button>
                      {inviteToken && (
                        <button className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:opacity-50" onClick={handleAcceptInvite} disabled={isSubmitting}>
                          Accept invite only
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 text-base font-semibold text-slate-900">Request Elevated Access</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select className="rounded border border-slate-300 px-3 py-2" value={accessRequestForm.requested_role} onChange={(event) => setAccessRequestForm({ ...accessRequestForm, requested_role: event.target.value as SystemRole })}>
                        <option value="eso_coach">ESO Coach</option>
                        <option value="eso_staff">ESO Staff</option>
                        <option value="eso_admin">ESO Admin</option>
                      </select>
                      <select className="rounded border border-slate-300 px-3 py-2" value={accessRequestForm.requested_ecosystem_id} onChange={(event) => setAccessRequestForm({ ...accessRequestForm, requested_ecosystem_id: event.target.value })}>
                        {ecosystemOptions}
                      </select>
                      <select className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={accessRequestForm.requested_organization_id} onChange={(event) => setAccessRequestForm({ ...accessRequestForm, requested_organization_id: event.target.value })}>
                        {organizationOptions}
                      </select>
                      <textarea className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" rows={3} placeholder="Why do you need elevated access?" value={accessRequestForm.note} onChange={(event) => setAccessRequestForm({ ...accessRequestForm, note: event.target.value })} />
                    </div>
                    <div className="mt-4 flex gap-3">
                      <button className="rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={submitElevatedAccessRequest} disabled={isSubmitting}>
                        Submit access request
                      </button>
                      <button className="rounded border border-slate-300 px-4 py-2 font-medium text-slate-700 disabled:opacity-50" onClick={refreshRequest} disabled={isLoadingRequest}>
                        Refresh status
                      </button>
                    </div>
                    {request?.status === 'pending' && (
                      <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-4 py-3">
                        Pending elevated access request for {request.requested_role}.
                      </div>
                    )}
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
