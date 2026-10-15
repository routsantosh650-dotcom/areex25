import React, { useEffect, useState } from 'react';
import { X, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

type Mode = 'login' | 'signup';
type Stage = 'form' | 'verify-email';

interface AuthModalProps {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}

const FIREBASE_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address does not look right.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/email-already-in-use': 'An account with this email already exists. Log in instead.',
  'auth/weak-password': 'Please choose a stronger password (at least 12 characters).',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/too-many-requests': 'Too many attempts from this device. Please wait a few minutes.',
  'auth/network-request-failed': 'Network problem — check your connection and try again.',
  'auth/operation-not-allowed': 'Email/password accounts are not enabled on this project yet.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Your browser blocked the Google popup. Allow popups for this site.',
  'auth/unauthorized-domain': 'This web address is not authorized for Google sign-in yet.',
};

const describeAuthError = (err: unknown): string => {
  if (err instanceof FirebaseError) {
    return FIREBASE_MESSAGES[err.code] || err.message.replace('Firebase: ', '');
  }
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
};

export const AuthModal: React.FC<AuthModalProps> = ({ open, initialMode = 'login', onClose }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [stage, setStage] = useState<Stage>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setStage('form');
      setPassword('');
      setConfirm('');
      setError(null);
      setNotice(null);
      setBusy(false);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Checkout requires a verified email, so an unverified sign-in stops here with a resend link.
  const afterAuth = async (user: User) => {
    if (user.emailVerified) {
      onClose();
      return;
    }
    setPendingEmail(user.email || '');
    setStage('verify-email');
    setError(null);
    try {
      await sendEmailVerification(user);
      setNotice('We emailed you a verification link. Open it, then come back here.');
    } catch (err) {
      setNotice(null);
      setError(describeAuthError(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    if (mode === 'signup' && password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const cred =
        mode === 'signup'
          ? await createUserWithEmailAndPassword(auth, cleanEmail, password)
          : await signInWithEmailAndPassword(auth, cleanEmail, password);
      await afterAuth(cred.user);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await afterAuth(cred.user);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Type your email above first, then click "Forgot password".');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setNotice(`Password reset link sent to ${cleanEmail}. Check spam too.`);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRecheckVerification = async () => {
    setError(null);
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setStage('form');
        return;
      }
      await user.reload();
      if (user.emailVerified) {
        onClose();
      } else {
        setError('Still not verified. Open the link in the email, then press this button again.');
      }
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setStage('form');
        return;
      }
      await sendEmailVerification(user);
      setNotice(`Verification email re-sent to ${user.email || pendingEmail}.`);
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'mt-1.5 w-full rounded-lg border border-white/15 bg-[#090608] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-red-500 focus:outline-none';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative my-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#11090d] p-5 text-slate-100 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-slate-400 hover:border-red-500/40 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {stage === 'form' && (
          <>
            <h2 id="auth-modal-title" className="text-lg font-bold text-white">
              {mode === 'login' ? 'Log in to Areex Cloud' : 'Create your Areex account'}
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {mode === 'signup'
                ? 'Accounts are secured by Firebase Authentication. Verify your email once, then checkout works instantly.'
                : 'Use the email and password you registered with.'}
            </p>

            <form onSubmit={handleSubmit} className="mt-5" noValidate>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className={`${inputCls} pl-9`}
                />
              </div>

              <div className="mt-3">
                <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 12 characters' : 'Your password'}
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div className="mt-3">
                  <label htmlFor="auth-confirm" className="block text-xs font-medium text-slate-300">
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    className={inputCls}
                  />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{notice}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-4 flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
              </button>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={busy}
                  className="mt-2 w-full text-center text-xs text-slate-400 hover:text-white"
                >
                  Forgot password?
                </button>
              )}
            </form>

            <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
              <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40 disabled:opacity-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#4285F4]">
                G
              </span>
              Continue with Google
            </button>

            <p className="mt-4 text-center text-xs text-slate-400">
              {mode === 'login' ? (
                <>
                  New here?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError(null);
                      setNotice(null);
                    }}
                    className="font-semibold text-red-400 hover:text-red-300"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setNotice(null);
                    }}
                    className="font-semibold text-red-400 hover:text-red-300"
                  >
                    Log in
                  </button>
                </>
              )}
            </p>
          </>
        )}

        {stage === 'verify-email' && (
          <>
            <h2 id="auth-modal-title" className="text-lg font-bold text-white">
              One last step: verify your email
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              We sent a verification link to <span className="font-semibold text-white">{pendingEmail}</span>.
              Open it on this device, then press "I've verified". Checkout needs a verified email so that
              orders and support tickets reach the right account.
            </p>

            {error && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{notice}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleRecheckVerification}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? 'Checking...' : "I've verified — continue"}
            </button>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={busy}
              className="mt-2 w-full text-center text-xs text-slate-400 hover:text-white"
            >
              Resend verification email
            </button>
            <button
              type="button"
              onClick={() => {
                void signOut(auth);
                setStage('form');
                onClose();
              }}
              className="mt-2 w-full text-center text-xs text-slate-400 hover:text-white"
            >
              Not now — log out
            </button>
          </>
        )}
      </div>
    </div>
  );
};
