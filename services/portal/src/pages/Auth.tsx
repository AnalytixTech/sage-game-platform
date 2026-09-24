import { FormEvent, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Mode = 'signin' | 'signup' | 'forgot';

const redirectTo = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export function AuthPage({ supabase }: { supabase: SupabaseClient }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } });
        if (err) throw err;
        setNotice(`We sent a confirmation link to ${email}. Open it to activate your account, then sign in.`);
        setMode('signin');
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
        if (err) throw err;
        setNotice(`If ${email} has an account, a password reset link is on its way.`);
        setMode('signin');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    signin: 'Sign in',
    signup: 'Create your developer account',
    forgot: 'Reset your password',
  };

  return (
    <div className="auth">
      <h1>{titles[mode]}</h1>
      <p className="muted">
        {mode === 'signup'
          ? 'Register your app, pick its games and generate API keys for your backend.'
          : mode === 'forgot'
            ? 'Enter your account email and we will send you a reset link.'
            : 'Manage your SageGames apps and API keys.'}
      </p>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'forgot' && (
          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 10 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && <span className="hint">At least 10 characters, with upper and lower case letters and a number.</span>}
          </label>
        )}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>
      </form>

      <div className="auth-links">
        {mode !== 'signin' && <button className="link" onClick={() => setMode('signin')}>Back to sign in</button>}
        {mode === 'signin' && (
          <>
            <button className="link" onClick={() => setMode('signup')}>Create an account</button>
            <button className="link" onClick={() => setMode('forgot')}>Forgot password?</button>
          </>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordPage({ supabase, onDone }: { supabase: SupabaseClient; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else onDone();
  };

  return (
    <div className="auth">
      <h1>Choose a new password</h1>
      {error && <p className="error">{error}</p>}
      <form onSubmit={submit} className="stack">
        <label>
          New password
          <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}
