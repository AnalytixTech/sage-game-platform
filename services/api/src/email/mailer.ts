/**
 * Account emails, sent through Brevo's transactional API (BREVO_API_KEY, EMAIL_FROM). Without a
 * key, development logs the email (with its links) instead; production refuses to send.
 */
import { Logger } from '../observability/logger';
import { EmailContent } from './templates';

export interface OutgoingEmail extends EmailContent {
  to: string;
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured (set BREVO_API_KEY and EMAIL_FROM)');
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/** "SageGames <no-reply@example.com>" or "no-reply@example.com". */
export function parseSender(from: string): { email: string; name: string } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1].replace(/^"|"$/g, '') || 'SageGames', email: match[2].trim() };
  return { name: 'SageGames', email: from.trim() };
}

export function createMailer(
  options: { brevoApiKey?: string; emailFrom?: string; production: boolean },
  logger: Logger,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Mailer {
  const { brevoApiKey, emailFrom } = options;
  if (brevoApiKey && emailFrom) {
    const sender = parseSender(emailFrom);
    return {
      async send(email) {
        const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender,
            to: [{ email: email.to }],
            subject: email.subject,
            htmlContent: email.html,
            textContent: email.text,
            tags: ['sagegames-auth'],
          }),
        });
        if (!res.ok) throw new Error(`Brevo responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
      },
    };
  }

  return {
    async send(email) {
      if (options.production) throw new EmailNotConfiguredError();
      const links = email.text.match(/https?:\/\/\S+/g) ?? [];
      logger.info('email not sent (no BREVO_API_KEY): logging it instead', { component: 'email', to: email.to, subject: email.subject, links });
    },
  };
}

/** Collects emails in memory (tests). */
export function memoryMailer(): Mailer & { sent: OutgoingEmail[]; last(to?: string): OutgoingEmail | undefined; linkIn(email?: OutgoingEmail): string } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    async send(email) {
      sent.push(email);
    },
    last: (to) => [...sent].reverse().find((e) => !to || e.to === to),
    linkIn: (email) => (email?.text.match(/https?:\/\/\S+/) ?? [''])[0],
  };
}
