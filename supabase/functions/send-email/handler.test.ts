import { describe, expect, it } from 'vitest';
import { buildEmails, Config, sendWithBrevo, SendEmailHookPayload } from './handler';

const cfg: Config = {
  supabaseUrl: 'https://aohcevwbwhjbtrvsmmcu.supabase.co',
  senderEmail: 'no-reply@sageanalytix.cloud',
  senderName: 'SageGames',
};

const payload = (action: string, extra: Partial<SendEmailHookPayload['email_data']> = {}, user: Partial<SendEmailHookPayload['user']> = {}): SendEmailHookPayload => ({
  user: { id: 'u1', email: 'dev@japabudz.com', ...user },
  email_data: {
    token: '123456',
    token_hash: 'hash_main',
    redirect_to: 'https://sage-game-platform.onrender.com/portal/',
    email_action_type: action,
    site_url: 'https://sage-game-platform.onrender.com/portal/',
    ...extra,
  },
});

describe('send-email hook', () => {
  it('builds a sign-up confirmation that verifies with Supabase and returns to the portal', () => {
    const [email] = buildEmails(payload('signup'), cfg);
    expect(email.to).toBe('dev@japabudz.com');
    expect(email.subject).toBe('Confirm your SageGames developer account');
    const url = new URL(email.text.match(/https:\/\/\S+verify\S+/)![0]);
    expect(url.origin + url.pathname).toBe('https://aohcevwbwhjbtrvsmmcu.supabase.co/auth/v1/verify');
    expect(url.searchParams.get('token')).toBe('hash_main');
    expect(url.searchParams.get('type')).toBe('signup');
    expect(url.searchParams.get('redirect_to')).toBe('https://sage-game-platform.onrender.com/portal/');
    expect(email.html).toContain('Confirm email');
  });

  it('builds a password reset link', () => {
    const [email] = buildEmails(payload('recovery'), cfg);
    expect(email.subject).toBe('Reset your SageGames password');
    expect(email.html).toContain('type=recovery');
  });

  it('sends secure email-change confirmations to both addresses with the right tokens', () => {
    const emails = buildEmails(payload('email_change', { token_hash_new: 'hash_for_current' }, { new_email: 'new@japabudz.com' }), cfg);
    expect(emails.map((e) => [e.to, /token=(\w+)/.exec(e.text)?.[1]])).toEqual([
      ['dev@japabudz.com', 'hash_for_current'],
      ['new@japabudz.com', 'hash_main'],
    ]);
  });

  it('sends the one-time code for reauthentication', () => {
    const [email] = buildEmails(payload('reauthentication'), cfg);
    expect(email.text).toContain('Code: 123456');
  });

  it('sends notices without links', () => {
    const [changed] = buildEmails(payload('password_changed_notification'), cfg);
    expect(changed.subject).toBe('Your SageGames password was changed');
    expect(changed.html).not.toContain('href=');
    const [other] = buildEmails(payload('mfa_factor_enrolled_notification'), cfg);
    expect(other.text).toContain('mfa factor enrolled');
  });

  it('escapes user-controlled values in HTML', () => {
    const [email] = buildEmails(payload('signup', {}, { email: '<script>@x.com' }), cfg);
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('rejects unknown actions instead of sending something odd', () => {
    expect(() => buildEmails(payload('something_new'), cfg)).toThrow('Unsupported email action');
  });

  it('sends through the Brevo API with the sender, recipient and both bodies', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
      calls.push({ url, headers: init.headers, body: init.body });
      return { ok: true, status: 201, text: async () => '' };
    };
    const [email] = buildEmails(payload('signup'), cfg);
    await sendWithBrevo(email, 'xkeysib-test', cfg, fetchImpl as never);
    expect(calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(calls[0].headers['api-key']).toBe('xkeysib-test');
    const body = JSON.parse(calls[0].body);
    expect(body.sender).toEqual({ email: 'no-reply@sageanalytix.cloud', name: 'SageGames' });
    expect(body.to).toEqual([{ email: 'dev@japabudz.com' }]);
    expect(body.htmlContent).toContain('<html');
    expect(body.textContent).toContain('Confirm email:');
  });

  it('surfaces Brevo errors so Supabase reports the failure', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"code":"unauthorized"}' });
    const [email] = buildEmails(payload('signup'), cfg);
    await expect(sendWithBrevo(email, 'bad', cfg, fetchImpl as never)).rejects.toThrow('Brevo responded 401');
  });
});
