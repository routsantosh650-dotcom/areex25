import React, { useEffect, useState } from 'react';
import { X, Mail, Lock, AlertCircle } from 'lucide-react';
import { setSession } from '../customerSession';

type Mode = 'login' | 'signup';

interface AuthModalProps {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, initialMode = 'login', onClose }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authStage, setAuthStage] = useState<'credentials' | 'setup' | 'verify'>('credentials');
  const [pendingToken, setPendingToken] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPassword('');
      setConfirm('');
      setError(null);
      setBusy(false);
      setAuthStage('credentials');
      setPendingToken('');
      setSetupSecret('');
      setOtpauthUrl('');
      setAuthCode('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your email.');
      return;
    }
    if (mode === 'signup') {
      if (password.length < 12) {
        setError('Password must be at least 12 characters.');
        return;
      }
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      const res = await fetch(mode === 'signup' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      if (data.setupRequired || data.twoFactorRequired) {
        setPendingToken(data.pendingToken || '');
        setSetupSecret(data.setupSecret || '');
        setOtpauthUrl(data.otpauthUrl || '');
        setAuthStage(data.setupRequired ? 'setup' : 'verify');
        setAuthCode('');
        setPassword('');
        setError(null);
        return;
      }
      if (!data.token) throw new Error('The server did not issue a login session.');
      setSession({ token: data.token, email: data.email });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(authCode)) {
      setError('Enter the current 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingToken, code: authCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) throw new Error(data.error || 'Two-factor verification failed.');
      setSession({ token: data.token, email: data.email });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Try again.');
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

        <h2 id="auth-modal-title" className="text-lg font-bold text-white">
          {mode === 'login' ? 'Log in to Areex Cloud' : 'Create your Areex account'}
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          {mode === 'signup'
            ? 'This email and password will also be your game panel login.'
            : 'Use the email and password you registered with.'}
        </p>

        {authStage === 'credentials' && <form onSubmit={handleSubmit} className="mt-5" noValidate>
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

          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>}

        {authStage !== 'credentials' && (
          <form onSubmit={handleMfaSubmit} className="mt-5 space-y-4">
            {authStage === 'setup' ? (
              <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-slate-200">
                <h3 className="font-semibold text-white">Set up required two-factor authentication</h3>
                <p className="mt-2 text-slate-300">Open Google Authenticator or Microsoft Authenticator, add an account manually, and enter this setup key:</p>
                <code className="mt-2 block break-all rounded-lg bg-black/40 p-3 text-sm font-bold tracking-widest text-red-200">{setupSecret}</code>
                <p className="mt-2 text-slate-400">Account URI (if your authenticator supports it):</p>
                <code className="mt-1 block break-all text-[10px] text-slate-400">{otpauthUrl}</code>
                <p className="mt-2 text-slate-300">Enter the app's current 6-digit code below to finish setup. Your account won't be logged in until verification succeeds.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-300">Enter the current 6-digit code from your authenticator app to finish logging in.</p>
            )}
            <label htmlFor="auth-2fa-code" className="block text-xs font-medium text-slate-300">Authenticator code</label>
            <input
              id="auth-2fa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={authCode}
              onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className={inputCls}
            />
            {error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/60 p-3 text-xs text-red-200">{error}</div>}
            <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Verifying...' : authStage === 'setup' ? 'Enable 2FA & Sign In' : 'Verify & Sign In'}
            </button>
            <button type="button" disabled={busy} onClick={() => { setAuthStage('credentials'); setPendingToken(''); setSetupSecret(''); setOtpauthUrl(''); setAuthCode(''); setError(null); }} className="w-full text-xs text-slate-400 hover:text-white">Back to login</button>
          </form>
        )}

        {authStage === 'credentials' && <p className="mt-4 text-center text-xs text-slate-400">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
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
                }}
                className="font-semibold text-red-400 hover:text-red-300"
              >
                Log in
              </button>
            </>
          )}
        </p>}
      </div>
    </div>
  );
};
