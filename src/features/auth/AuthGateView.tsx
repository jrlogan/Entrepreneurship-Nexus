import React, { useEffect, useMemo, useState } from 'react';
import type { Ecosystem, InviteSummary, Organization } from '../../domain/types';
import { FirebaseAuthPanel } from '../../shared/ui/FirebaseAuthPanel';
import { createUserWithEmail, sendPasswordReset, signInWithEmail, signInWithGoogle, signOutUser } from '../../services/authService';
import { getDocument } from '../../services/firestoreClient';
import { isEmulatorMode } from '../../services/firebaseConfig';
import { callHttpFunction } from '../../services/httpFunctionClient';
import { CONFIG } from '../../app/config';
import { AgreementCheckbox } from '../../shared/ui/AgreementGate';
import { FirebaseAgreementsRepo } from '../../data/repos/firebase/agreements';
import type { AgreementType } from '../../domain/agreements/types';
import { isFirebaseEnabled } from '../../services/firebaseApp';

const agreementsRepo = new FirebaseAgreementsRepo();

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
  venture_name: string;
  venture_description: string;
};

type SignInFormState = {
  email: string;
  password: string;
};

const humanizeIdentifier = (value: string) => value
  .replace(/^eco_/, '')
  .replace(/[_-]+/g, ' ')
  .trim()
  .replace(/\b\w/g, (char) => char.toUpperCase());

const humanizeRole = (role: string): string => {
  const labels: Record<string, string> = {
    platform_admin: 'Platform Admin',
    ecosystem_manager: 'Ecosystem Manager',
    eso_admin: 'ESO Admin',
    eso_staff: 'ESO Staff',
    eso_coach: 'Coach',
    entrepreneur: 'Entrepreneur',
  };
  return labels[role] || humanizeIdentifier(role);
};

export const AuthGateView: React.FC<AuthGateViewProps> = ({
  status,
  authUserEmail,
  organizations,
  ecosystems,
}) => {
  const [inviteSummary, setInviteSummary] = useState<InviteSummary | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [inviteLoadError, setInviteLoadError] = useState<{ message: string; reason?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [genericAuthMode, setGenericAuthMode] = useState<'signin' | 'signup' | null>(null);
  const [displayEcosystems, setDisplayEcosystems] = useState<Ecosystem[]>(ecosystems);
  const [signInForm, setSignInForm] = useState<SignInFormState>({
    email: authUserEmail || '',
    password: '',
  });
  const inviteToken = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    const fromUrl = new URLSearchParams(window.location.search).get('invite') || '';
    if (fromUrl) {
      try { sessionStorage.setItem('pending_invite_token', fromUrl); } catch { /* ignore */ }
      return fromUrl;
    }
    try { return sessionStorage.getItem('pending_invite_token') || ''; } catch { return ''; }
  }, []);
  const defaultEcosystemId = displayEcosystems[0]?.id || '';
  const inviteEcosystemId = inviteSummary?.ecosystem_id || '';
  const effectiveEcosystemId = inviteEcosystemId || defaultEcosystemId;
  const inviteOrganization = inviteSummary?.organization_id
    ? organizations.find((organization) => organization.id === inviteSummary.organization_id) || null
    : null;
  const inviteEcosystem = inviteSummary?.ecosystem_id
    ? displayEcosystems.find((ecosystem) => ecosystem.id === inviteSummary.ecosystem_id) || null
    : null;
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const ESO_ROLES = new Set(['eso_staff', 'eso_admin', 'eso_coach']);
  const requiredAgreementType: AgreementType = inviteSummary && ESO_ROLES.has(inviteSummary.invited_role)
    ? 'data_usage_agreement'
    : 'privacy_policy';
  const [showVentureFields, setShowVentureFields] = useState(false);
  const [signupForm, setSignupForm] = useState<SignupFormState>({
    first_name: '',
    last_name: '',
    email: authUserEmail || '',
    password: '',
    ecosystem_id: defaultEcosystemId,
    venture_name: '',
    venture_description: '',
  });

  useEffect(() => {
    let cancelled = false;

    const applyOverrides = async () => {
      const nextEcosystems = await Promise.all(ecosystems.map(async (ecosystem) => {
        let override: Partial<Ecosystem> | null = null;

        try {
          const raw = localStorage.getItem(`eco_override_${ecosystem.id}`);
          if (raw) {
            override = JSON.parse(raw) as Partial<Ecosystem>;
          }
        } catch {
          // ignore malformed local overrides
        }

        if (!override && !isEmulatorMode) {
          try {
            override = await getDocument<Partial<Ecosystem>>('ecosystems', ecosystem.id);
          } catch {
            // ignore fetch failures
          }
        }

        const displayName = override?.name?.trim() || ecosystem.name?.trim() || humanizeIdentifier(ecosystem.id);
        return {
          ...ecosystem,
          ...override,
          name: displayName,
        };
      }));

      if (!cancelled) {
        setDisplayEcosystems(nextEcosystems);
      }
    };

    void applyOverrides();
    return () => {
      cancelled = true;
    };
  }, [ecosystems]);

  useEffect(() => {
    const prefillEmail = authUserEmail || inviteSummary?.email || '';
    setSignupForm((current) => ({
      ...current,
      email: prefillEmail || current.email,
      ecosystem_id: inviteEcosystemId || current.ecosystem_id || defaultEcosystemId,
    }));
    setSignInForm((current) => ({
      ...current,
      email: prefillEmail || current.email,
    }));
  }, [authUserEmail, defaultEcosystemId, inviteEcosystemId, inviteSummary?.email]);

  useEffect(() => {
    if (status !== 'unauthenticated' || inviteToken) {
      setGenericAuthMode(null);
      return;
    }
    setGenericAuthMode((current) => current ?? 'signin');
  }, [inviteToken, status]);

  useEffect(() => {
    if (!inviteToken) {
      setInviteSummary(null);
      return;
    }

    let cancelled = false;
    setIsLoadingInvite(true);
    setInviteLoadError(null);
    const loadInvite = async () => {
      try {
        const summary = await callHttpFunction<{ token: string }, InviteSummary>('getInviteSummary', { token: inviteToken });
        if (!cancelled) {
          setInviteSummary(summary);
        }
      } catch (err: any) {
        if (!cancelled) {
          const reason: string | undefined = err?.reason;
          const message = reason === 'already_accepted'
            ? 'This invite has already been used. If you have an account, sign in below.'
            : reason === 'revoked'
            ? 'This invite has been revoked. Please contact your administrator for a new one.'
            : reason === 'expired' || err?.status === 410
            ? 'This invite link has expired. Please contact your administrator for a new one.'
            : err?.status === 404
            ? 'This invite link is not valid. It may have already been used or the link is incorrect.'
            : 'Your invite details could not be loaded. Check your connection, or contact your administrator.';
          setInviteLoadError({ message, reason });
        }
      } finally {
        if (!cancelled) setIsLoadingInvite(false);
      }
    };

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const ecosystemOptions = useMemo(() => displayEcosystems.map((ecosystem) => (
    <option key={ecosystem.id} value={ecosystem.id}>{ecosystem.name}</option>
  )), [displayEcosystems]);

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
        ecosystem_id: inviteEcosystemId || signupForm.ecosystem_id,
        first_name: signupForm.first_name.trim(),
        last_name: signupForm.last_name.trim(),
        ...(signupForm.venture_name.trim() ? { venture_name: signupForm.venture_name.trim() } : {}),
        ...(signupForm.venture_description.trim() ? { venture_description: signupForm.venture_description.trim() } : {}),
      });

      if (inviteToken) {
        try {
          await callHttpFunction('acceptInvite', { token: inviteToken });
          try { sessionStorage.removeItem('pending_invite_token'); } catch { /* ignore */ }
        } catch (inviteErr: any) {
          // Account was created but invite accept failed — redirect anyway and show warning.
          // The user can retry from inside the app or an admin can adjust their role.
          setError(`Account created, but the invite could not be applied: ${inviteErr?.message || 'unknown error'}. Please contact your administrator to assign your role, or try signing in again.`);
          setIsSubmitting(false);
          return;
        }
      }

      // Record agreement acceptance now that the person record exists
      if (isFirebaseEnabled() && credential?.user?.uid) {
        const ecosystemId = inviteEcosystemId || signupForm.ecosystem_id;
        try {
          await agreementsRepo.recordAcceptance(
            credential.user.uid,
            credential.user.uid,
            ecosystemId,
            requiredAgreementType,
            inviteToken ? 'invite' : 'signup'
          );
        } catch { /* non-fatal — post-login gate will catch if needed */ }
      }

      setSuccess('Account created. Reloading your workspace.');
      window.location.href = '/';
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
      if (inviteToken) {
        try {
          await callHttpFunction('acceptInvite', { token: inviteToken });
          try { sessionStorage.removeItem('pending_invite_token'); } catch { /* ignore */ }
        } catch (inviteErr: any) {
          setError(`Signed in, but the invite could not be applied: ${inviteErr?.message || 'unknown error'}. Please contact your administrator.`);
          setIsSubmitting(false);
          return;
        }
      }
      setSuccess('Signed in. Loading your workspace.');
      window.location.href = '/';
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
      // Do NOT call completeSelfSignup here — it runs unconditionally and would
      // create an entrepreneur-role membership for existing ESO/admin accounts,
      // overriding their real role. New users who have no profile will land on
      // the needs_profile screen and complete signup from there.
      if (inviteToken) {
        try {
          await callHttpFunction('acceptInvite', { token: inviteToken });
          try { sessionStorage.removeItem('pending_invite_token'); } catch { /* ignore */ }
        } catch (inviteErr: any) {
          // Non-fatal but visible — user signed in but may not have their invited role.
          setError(`Signed in, but your invite could not be applied: ${inviteErr?.message || 'unknown error'}. Please contact your administrator to assign your role.`);
          setIsSubmitting(false);
          return;
        }
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
        ecosystem_id: inviteEcosystemId || signupForm.ecosystem_id,
        first_name: signupForm.first_name.trim(),
        last_name: signupForm.last_name.trim(),
      });

      if (inviteToken) {
        await callHttpFunction('acceptInvite', { token: inviteToken });
        try { sessionStorage.removeItem('pending_invite_token'); } catch { /* ignore */ }
      }

      setSuccess('Profile completed. Reloading your workspace.');
      window.location.href = '/';
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
      try { sessionStorage.removeItem('pending_invite_token'); } catch { /* ignore */ }
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
            {inviteToken ? (
              <>
                <div className="inline-flex rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
                  You have been invited
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Welcome to the Entrepreneurship Nexus</h1>
                  {isLoadingInvite ? (
                    <p className="max-w-2xl text-lg leading-8 text-slate-300">Loading your invitation details&hellip;</p>
                  ) : inviteLoadError ? (
                    <div className="max-w-2xl rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-rose-200">
                      <span className="font-semibold text-rose-100">Invite issue: </span>{inviteLoadError.message}
                    </div>
                  ) : inviteSummary ? (
                    <p className="max-w-2xl text-lg leading-8 text-slate-300">
                      You&rsquo;ve been invited to join as <strong className="text-white">{humanizeRole(inviteSummary.invited_role)}</strong>
                      {inviteSummary.email ? <> for <strong className="text-white">{inviteSummary.email}</strong></> : ''}.
                      {' '}Create your account below to get started, or sign in if you already have one.
                    </p>
                  ) : (
                    <p className="max-w-2xl text-lg leading-8 text-slate-300">
                      You have an invite link. Create an account or sign in with the invited email to accept it.
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Shared network</div>
                    <div className="mt-1 text-sm text-slate-300">Access referrals, introductions, and partner activity across your ecosystem.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Scoped access</div>
                    <div className="mt-1 text-sm text-slate-300">Entrepreneurs can sign up directly. Invites are used when someone needs access tied to a specific organization or role.</div>
                  </div>
                </div>
                {(inviteEcosystem || inviteOrganization) && (
                  <div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/10 p-4 text-sm text-indigo-50">
                    <div className="font-semibold text-white">Invite scope</div>
                    {inviteEcosystem && <div className="mt-1">Ecosystem: <strong>{inviteEcosystem.name}</strong></div>}
                    {inviteOrganization && <div className="mt-1">Organization: <strong>{inviteOrganization.name}</strong></div>}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Founder Resource Network
                </div>
                <div className="space-y-4">
                  <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Entrepreneurship Nexus</h1>
                  <p className="max-w-2xl text-lg leading-8 text-slate-300">
                    {status === 'needs_profile'
                      ? 'You are signed in, but this account does not have an active Nexus membership yet.'
                      : 'A shared place to connect entrepreneurs with programs, advisors, referrals, and trusted local resources.'}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Find the right support</div>
                    <div className="mt-1 text-sm text-slate-300">Browse programs, connect with organizations, and keep your next steps in one place.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Warm connections</div>
                    <div className="mt-1 text-sm text-slate-300">Share referrals and introductions across the network without losing context.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Trusted access</div>
                    <div className="mt-1 text-sm text-slate-300">Organizations can invite staff into the right workspace when collaboration is needed.</div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/30">
            <FirebaseAuthPanel />
            <div className="space-y-4 px-6 py-6 text-sm text-slate-700">
              {status === 'loading' && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">Checking your session.</div>
              )}

              {status === 'unauthenticated' && inviteToken && (
                <>
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="mb-1 text-base font-semibold text-indigo-900">
                      New here? Create an account to accept your invite
                    </div>
                    <div className="mb-3 text-xs text-indigo-700">Fill in your name and choose a password — your email is already set from the invite.</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="First name" value={signupForm.first_name} onChange={(event) => setSignupForm({ ...signupForm, first_name: event.target.value })} />
                      <input className="rounded border border-slate-300 px-3 py-2" placeholder="Last name" value={signupForm.last_name} onChange={(event) => setSignupForm({ ...signupForm, last_name: event.target.value })} />
                      <input
                        className="rounded border border-slate-300 bg-slate-50 px-3 py-2 sm:col-span-2 text-slate-600"
                        placeholder={isLoadingInvite ? 'Loading invite details…' : 'Email'}
                        value={signupForm.email}
                        readOnly
                      />
                      <input className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" type="password" placeholder="Password" value={signupForm.password} onChange={(event) => setSignupForm({ ...signupForm, password: event.target.value })} />
                      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 text-slate-700">
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ecosystem</div>
                        <div className="mt-1">{inviteEcosystem?.name || effectiveEcosystemId}</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <AgreementCheckbox
                        agreementType={requiredAgreementType}
                        checked={agreedToTerms}
                        onChange={setAgreedToTerms}
                      />
                    </div>
                    <button className="mt-3 w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50" onClick={handleCreateEntrepreneurAccount} disabled={isSubmitting || isLoadingInvite || !agreedToTerms}>
                      {isLoadingInvite ? 'Loading invite…' : 'Create account and accept invite'}
                    </button>
                    <div className="mt-5 flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Or</span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-900">Already have an account? Sign in to accept.</div>
                      <div className="grid gap-2">
                        <input
                          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-600"
                          placeholder={isLoadingInvite ? 'Loading invite details…' : 'Email'}
                          value={signInForm.email}
                          readOnly
                        />
                        <input
                          className="rounded border border-slate-300 px-3 py-2"
                          type="password"
                          placeholder="Password"
                          value={signInForm.password}
                          onChange={(event) => setSignInForm({ ...signInForm, password: event.target.value })}
                        />
                      </div>
                      <button className="mt-3 w-full rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleSignIn} disabled={isSubmitting || isLoadingInvite}>
                        {isLoadingInvite ? 'Loading invite…' : 'Sign in and accept invite'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {status === 'unauthenticated' && !inviteToken && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    Choose how you want to enter. You can sign in, continue with Google, or create a new entrepreneur account.
                  </div>
                  <div className="grid gap-3">
                    <button
                      className={`rounded-2xl border-2 px-4 py-4 text-left transition cursor-pointer ${genericAuthMode === 'signin' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50'}`}
                      onClick={() => setGenericAuthMode('signin')}
                      disabled={isSubmitting}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${genericAuthMode === 'signin' ? 'border-white' : 'border-slate-400'}`}>
                          {genericAuthMode === 'signin' && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-base font-semibold">Sign in</div>
                          <div className={`mt-0.5 text-sm ${genericAuthMode === 'signin' ? 'text-slate-200' : 'text-slate-500'}`}>Use your existing account to get back to your workspace.</div>
                        </div>
                      </div>
                    </button>
                    <button
                      className={`rounded-2xl border-2 px-4 py-4 text-left transition cursor-pointer ${genericAuthMode === 'signup' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-900 hover:border-indigo-300 hover:bg-indigo-50'}`}
                      onClick={() => setGenericAuthMode('signup')}
                      disabled={isSubmitting}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${genericAuthMode === 'signup' ? 'border-white' : 'border-slate-400'}`}>
                          {genericAuthMode === 'signup' && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                        <div>
                          <div className="text-base font-semibold">Create entrepreneur account</div>
                          <div className={`mt-0.5 text-sm ${genericAuthMode === 'signup' ? 'text-indigo-100' : 'text-slate-500'}`}>Join the network to connect with programs, organizations, and resources.</div>
                        </div>
                      </div>
                    </button>
                  </div>
                  {genericAuthMode === 'signin' && (
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
                  )}
                  {genericAuthMode === 'signup' && (
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
                      </div>
                      {!showVentureFields ? (
                        <button
                          type="button"
                          className="mt-3 text-xs text-slate-500 hover:text-slate-700 underline"
                          onClick={() => setShowVentureFields(true)}
                        >
                          + Add your venture details (optional)
                        </button>
                      ) : (
                        <div className="mt-3 grid gap-3">
                          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                            Tell us about your venture — you can skip this and fill it in later.
                          </div>
                          <input className="rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Venture / company name (optional)" value={signupForm.venture_name} onChange={(event) => setSignupForm({ ...signupForm, venture_name: event.target.value })} />
                          <textarea className="rounded border border-slate-300 px-3 py-2 text-sm" rows={2} placeholder="What are you working on? (optional)" value={signupForm.venture_description} onChange={(event) => setSignupForm({ ...signupForm, venture_description: event.target.value })} />
                          <button
                            type="button"
                            className="text-left text-xs text-slate-400 hover:text-slate-600 underline"
                            onClick={() => { setShowVentureFields(false); setSignupForm((f) => ({ ...f, venture_name: '', venture_description: '' })); }}
                          >
                            Skip venture details
                          </button>
                        </div>
                      )}
                      <div className="mt-4">
                        <AgreementCheckbox
                          agreementType="privacy_policy"
                          checked={agreedToTerms}
                          onChange={setAgreedToTerms}
                        />
                      </div>
                      <button className="mt-3 rounded bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50" onClick={handleCreateEntrepreneurAccount} disabled={isSubmitting || !agreedToTerms}>
                        Create entrepreneur account
                      </button>
                    </div>
                  )}
                </>
              )}

              {status === 'needs_profile' && isSubmitting && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900">
                  <div className="font-medium">Setting up your account&hellip;</div>
                  <div className="mt-1 text-sm">Please wait while we configure your workspace.</div>
                </div>
              )}

              {status === 'needs_profile' && !isSubmitting && (
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
                      {inviteToken ? (
                        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 text-slate-700">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Ecosystem</div>
                          <div className="mt-1">{inviteEcosystem?.name || effectiveEcosystemId}</div>
                        </div>
                      ) : (
                        <select className="rounded border border-slate-300 px-3 py-2 sm:col-span-2" value={signupForm.ecosystem_id} onChange={(event) => setSignupForm({ ...signupForm, ecosystem_id: event.target.value })}>
                          {ecosystemOptions}
                        </select>
                      )}
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
