/**
 * Supabase Auth "send email" hook: every auth email (sign-up confirmation, password reset,
 * email change, security notices) is rendered here and sent with the Brevo transactional API.
 *
 * Secrets (npx supabase secrets set --env-file supabase/.env):
 *   BREVO_API_KEY            Brevo > SMTP & API > API keys (xkeysib-…)
 *   SEND_EMAIL_HOOK_SECRET   "v1,whsec_…", the same value as [auth.hook.send_email] secrets
 *   EMAIL_SENDER             optional, default no-reply@sageanalytix.cloud
 *   EMAIL_SENDER_NAME        optional, default SageGames
 */
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { buildEmails, Config, sendWithBrevo, SendEmailHookPayload } from './handler.ts';

const hookSecret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace(/^v1,whsec_/, '');
const brevoKey = Deno.env.get('BREVO_API_KEY') ?? '';
const config: Config = {
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  senderEmail: Deno.env.get('EMAIL_SENDER') ?? 'no-reply@sageanalytix.cloud',
  senderName: Deno.env.get('EMAIL_SENDER_NAME') ?? 'SageGames',
};

/** Error shape Supabase Auth expects from hooks. */
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'Method not allowed');
  if (!hookSecret || !brevoKey) return fail(500, 'Email hook is not configured');

  const body = await req.text();
  let payload: SendEmailHookPayload;
  try {
    // Only Supabase Auth, holding the shared secret, can call this function.
    payload = new Webhook(hookSecret).verify(body, Object.fromEntries(req.headers)) as SendEmailHookPayload;
  } catch {
    return fail(401, 'Invalid signature');
  }

  try {
    for (const email of buildEmails(payload, config)) {
      await sendWithBrevo(email, brevoKey, config, fetch);
    }
  } catch (err) {
    console.error('send-email failed', payload.email_data?.email_action_type, err);
    return fail(500, 'Could not send the email. Please try again.');
  }

  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
