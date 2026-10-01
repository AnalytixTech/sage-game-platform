import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { ApiError, auth, getUser } from '../api';
import { Link, navigate } from '../router';
import { Icon } from '../ui';

/** Split layout: the product on the left, the form on the right (stacked on phones). */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark" style={{ background: 'rgba(255,255,255,.2)' }}>◆</span>
          <strong>SageGames Developers</strong>
        </div>
        <div>
          <h1>Five polished games your players will love, in an afternoon.</h1>
          <p>Drop-in React Native and web SDKs, scores the server verifies, live battles and a theme that matches your app.</p>
          <div className="auth-tiles" aria-hidden>
            {['🧠', '🃏', '🔢', '🔎', '⚡'].map((g) => (
              <div key={g} className="auth-tile">{g}</div>
            ))}
          </div>
          <div className="auth-points">
            <div><Icon name="check" size={16} /> Every score replayed and verified on the server</div>
            <div><Icon name="check" size={16} /> 2 to 16 player battles for chats and groups</div>
            <div><Icon name="check" size={16} /> Presets, your brand colour, or your own components</div>
          </div>
        </div>
        <Link to="/docs" style={{ color: '#fff', fontWeight: 600 }}>Read the documentation →</Link>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  );
}

const PASSWORD_HINT = 'At least 10 characters, with upper and lower case letters and a number.';
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');

export type AuthMode = 'signin' | 'signup' | 'forgot';

export function AuthPage({ mode: initialMode = 'signin' }: { mode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  useEffect(() => setMode(initialMode), [initialMode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setUnverified(false);
    try {
      if (mode === 'signin') {
        await auth.signIn(email, password);
        navigate('/', { replace: true });
      } else if (mode === 'signup') {
        await auth.signUp(email, password);
        setNotice(`We sent a confirmation link to ${email}. Open it to activate your account.`);
        setMode('signin');
      } else {
        await auth.forgotPassword(email);
        setNotice(`If ${email} has an account, a password reset link is on its way.`);
        setMode('signin');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') setUnverified(true);
      if (err instanceof ApiError && err.code === 'password_setup_required') setNotice(err.message);
      else setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    try {
      setNotice(await auth.resendVerification(email));
      setError(null);
      setUnverified(false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<AuthMode, string> = {
    signin: 'Sign in',
    signup: 'Create your developer account',
    forgot: 'Reset your password',
  };

  return (
    <AuthLayout>
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
        {unverified && (
          <button className="link" onClick={resend} disabled={busy}>
            Send the confirmation link again
          </button>
        )}

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
              {mode === 'signup' && <span className="hint">{PASSWORD_HINT}</span>}
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
    </AuthLayout>
  );
}

const tokenFromUrl = () => new URLSearchParams(window.location.search).get('token') ?? '';

/** /portal/verify-email?token=… (sign-up confirmation and email changes): confirms, then signs in. */
export function VerifyEmailPage() {
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // the link works once: don't send it twice in development's double effects
    started.current = true;
    auth
      .verifyEmail(tokenFromUrl())
      .then(() => navigate('/', { replace: true }))
      .catch((err) => setError(message(err)));
  }, []);
  return (
    <AuthLayout>
      <div className="auth">
        <h1>Confirming your email…</h1>
        {error ? (
          <>
            <p className="error">{error}</p>
            <Link to="/">Back to sign in</Link>
          </>
        ) : (
          <p className="muted">One moment.</p>
        )}
      </div>
    </AuthLayout>
  );
}

/** /portal/reset-password?token=… (forgotten passwords, and first sign-in after moving platforms). */
export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.resetPassword(tokenFromUrl(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="auth">
        <h1>Choose a new password</h1>
        <p className="muted">You'll be signed out everywhere else.</p>
        {error && <p className="error">{error}</p>}
        <form onSubmit={submit} className="stack">
          <label>
            New password
            <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="hint">{PASSWORD_HINT}</span>
          </label>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      </div>
    </AuthLayout>
  );
}

/** /portal/account: change email and password, sign out everywhere, delete the account. */
export function AccountPage() {
  const user = getUser();
  return (
    <div className="stack" style={{ maxWidth: 560 }}>
      <h1>Your account</h1>
      <p className="muted">Signed in as {user?.email}.</p>
      <AccountForm
        title="Change password"
        submitLabel="Change password"
        fields={[
          ['current', 'Current password', 'current-password'],
          ['next', 'New password', 'new-password'],
        ]}
        hint={PASSWORD_HINT}
        onSubmit={async (v) => {
          await auth.changePassword(v.current, v.next);
          return 'Password changed. Other sessions were signed out.';
        }}
      />
      <AccountForm
        title="Change email"
        submitLabel="Send confirmation link"
        fields={[
          ['email', 'New email', 'email'],
          ['password', 'Password', 'current-password'],
        ]}
        onSubmit={(v) => auth.changeEmail(v.email, v.password)}
      />
      <section className="card stack">
        <h2>Sessions</h2>
        <p className="muted">Sign out of the portal on every device and browser.</p>
        <div>
          <button onClick={() => void auth.signOut(true)}>Sign out everywhere</button>
        </div>
      </section>
      <AccountForm
        title="Delete account"
        submitLabel="Delete my account"
        danger
        fields={[['password', 'Password', 'current-password']]}
        hint="Delete your apps first. This can't be undone."
        onSubmit={async (v) => {
          await auth.deleteAccount(v.password);
          return 'Account deleted.';
        }}
      />
    </div>
  );
}

function AccountForm({
  title,
  fields,
  submitLabel,
  hint,
  danger,
  onSubmit,
}: {
  title: string;
  fields: [name: string, label: string, autoComplete: string][];
  submitLabel: string;
  hint?: string;
  danger?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<string>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await onSubmit(values));
      setValues({});
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <form onSubmit={submit} className="stack">
        <h2>{title}</h2>
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
        {fields.map(([name, label, autoComplete]) => (
          <label key={name}>
            {label}
            <input
              type={autoComplete === 'email' ? 'email' : 'password'}
              autoComplete={autoComplete}
              required
              value={values[name] ?? ''}
              onChange={(e) => setValues({ ...values, [name]: e.target.value })}
            />
          </label>
        ))}
        {hint && <span className="hint">{hint}</span>}
        <div>
          <button className={danger ? 'danger' : 'primary'} disabled={busy}>
            {busy ? 'Please wait…' : submitLabel}
          </button>
        </div>
      </form>
    </section>
  );
}
