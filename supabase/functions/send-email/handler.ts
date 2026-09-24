/**
 * Turns a Supabase Auth "send email" hook payload into Brevo transactional emails.
 * Runtime-agnostic (no Deno or Node APIs), so it is unit-tested with Vitest.
 */
import * as t from './templates.ts';

/** The payload Supabase Auth posts to the send-email hook. */
export interface SendEmailHookPayload {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Config {
  supabaseUrl: string;
  senderEmail: string;
  senderName: string;
}

/** Link that verifies the token with Supabase Auth, then redirects to the portal. */
export function verifyUrl(cfg: Config, tokenHash: string, type: string, redirectTo: string): string {
  const base = cfg.supabaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ token: tokenHash, type, redirect_to: redirectTo });
  return `${base}/auth/v1/verify?${params.toString()}`;
}

/** Which emails to send for a hook call. */
export function buildEmails(payload: SendEmailHookPayload, cfg: Config): OutgoingEmail[] {
  const { user, email_data: d } = payload;
  const redirect = d.redirect_to || d.site_url;
  const to = (email: string, content: t.EmailContent): OutgoingEmail => ({ to: email, ...content });

  switch (d.email_action_type) {
    case 'signup':
      return [to(user.email, t.confirmSignup(user.email, verifyUrl(cfg, d.token_hash, 'signup', redirect)))];
    case 'recovery':
      return [to(user.email, t.resetPassword(user.email, verifyUrl(cfg, d.token_hash, 'recovery', redirect)))];
    case 'invite':
      return [to(user.email, t.invite(user.email, verifyUrl(cfg, d.token_hash, 'invite', redirect)))];
    case 'magiclink':
      return [to(user.email, t.magicLink(user.email, verifyUrl(cfg, d.token_hash, 'magiclink', redirect)))];
    case 'reauthentication':
      return [to(user.email, t.reauthenticate(d.token))];
    case 'email_change': {
      const newEmail = user.new_email ?? '';
      // Supabase's naming is inverted here: token_hash_new goes to the CURRENT address and
      // token_hash to the NEW one. With "secure email change" both addresses must confirm.
      const emails: OutgoingEmail[] = [];
      if (d.token_hash_new) {
        emails.push(to(user.email, t.confirmEmailChange(user.email, newEmail, verifyUrl(cfg, d.token_hash_new, 'email_change', redirect))));
      }
      if (newEmail && d.token_hash) {
        emails.push(to(newEmail, t.confirmEmailChange(user.email, newEmail, verifyUrl(cfg, d.token_hash, 'email_change', redirect))));
      }
      return emails;
    }
    case 'password_changed_notification':
      return [to(user.email, t.passwordChanged(user.email))];
    default:
      // Other security notices (email changed, MFA factor added…): a generic, link-free message.
      if (d.email_action_type.endsWith('_notification')) {
        return [to(user.email, t.genericNotice(user.email, d.email_action_type.replace(/_notification$/, '')))];
      }
      throw new Error(`Unsupported email action: ${d.email_action_type}`);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** Send through the Brevo transactional email API. */
export async function sendWithBrevo(email: OutgoingEmail, apiKey: string, cfg: Config, fetchImpl: FetchLike): Promise<void> {
  const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: cfg.senderEmail, name: cfg.senderName },
      to: [{ email: email.to }],
      subject: email.subject,
      htmlContent: email.html,
      textContent: email.text,
      tags: ['sagegames-auth'],
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}
