/** SageGames auth email templates (HTML with inline styles for email clients, plus plain text). */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

interface Layout {
  subject: string;
  title: string;
  /** Paragraph; may contain <strong> (values are escaped by the caller). */
  intro: string;
  button?: { label: string; url: string };
  /** Shown in a box, e.g. a one-time code. */
  code?: string;
  footer: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const stripTags = (value: string) => value.replace(/<[^>]+>/g, '');

function render(l: Layout): EmailContent {
  const button = l.button
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:#ba8109;">
                      <a href="${escapeHtml(l.button.url)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${l.button.label}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5d6680;">
                  If the button doesn't work, copy this link into your browser:<br />
                  <a href="${escapeHtml(l.button.url)}" style="color:#4f46e5;word-break:break-all;">${escapeHtml(l.button.url)}</a>
                </p>`
    : '';
  const code = l.code
    ? `
                <p style="margin:0;padding:14px 18px;background:#f4f5f9;border-radius:8px;font-size:28px;letter-spacing:6px;font-weight:bold;text-align:center;color:#141a2e;">${escapeHtml(l.code)}</p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${l.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f5f9;font-family:Arial,Helvetica,sans-serif;color:#141a2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f9;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#000b21;padding:20px 28px;">
                <span style="color:#ba8109;font-size:18px;font-weight:bold;">&#9670;</span>
                <span style="color:#ffffff;font-size:18px;font-weight:bold;">&nbsp;SageGames</span>
                <span style="color:#9aa6c4;font-size:14px;">&nbsp;Developers</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#141a2e;">${l.title}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d4560;">${l.intro}</p>${button}${code}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #e6e9f2;font-size:12px;line-height:1.6;color:#8a91a8;">
                ${l.footer}<br />
                SageGames by Sage Analytix &middot; sageanalytix.cloud
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  const text = [
    stripTags(l.title),
    '',
    stripTags(l.intro),
    ...(l.button ? ['', `${l.button.label}: ${l.button.url}`] : []),
    ...(l.code ? ['', `Code: ${l.code}`] : []),
    '',
    stripTags(l.footer),
    'SageGames by Sage Analytix · sageanalytix.cloud',
  ].join('\n');

  return { subject: l.subject, html, text };
}

export function confirmSignup(email: string, url: string): EmailContent {
  return render({
    subject: 'Confirm your SageGames developer account',
    title: 'Confirm your email',
    intro: `Thanks for signing up for the SageGames developer portal. Confirm <strong>${escapeHtml(email)}</strong> to activate your account, then sign in to create your app and API keys.`,
    button: { label: 'Confirm email', url },
    footer: "You received this because someone signed up for SageGames with this address. If it wasn't you, you can ignore this email.",
  });
}

export function resetPassword(email: string, url: string): EmailContent {
  return render({
    subject: 'Reset your SageGames password',
    title: 'Reset your password',
    intro: `We received a request to reset the password for <strong>${escapeHtml(email)}</strong>. The link below works once and expires in an hour.`,
    button: { label: 'Choose a new password', url },
    footer: "If you didn't ask for a reset, you can ignore this email. Your password won't change.",
  });
}

export function confirmEmailChange(currentEmail: string, newEmail: string, url: string): EmailContent {
  return render({
    subject: 'Confirm your new email for SageGames',
    title: 'Confirm your email change',
    intro: `Confirm that you want to change your SageGames sign-in email from <strong>${escapeHtml(currentEmail)}</strong> to <strong>${escapeHtml(newEmail)}</strong>.`,
    button: { label: 'Confirm change', url },
    footer: "If you didn't request this change, reset your password straight away.",
  });
}

export function invite(email: string, url: string): EmailContent {
  return render({
    subject: "You've been invited to SageGames",
    title: "You're invited",
    intro: `You've been invited to the SageGames developer portal as <strong>${escapeHtml(email)}</strong>. Accept to set up your account.`,
    button: { label: 'Accept invitation', url },
    footer: "If you weren't expecting this, you can ignore this email.",
  });
}

export function magicLink(email: string, url: string): EmailContent {
  return render({
    subject: 'Your SageGames sign-in link',
    title: 'Sign in to SageGames',
    intro: `Use this link to sign in as <strong>${escapeHtml(email)}</strong>. It works once and expires soon.`,
    button: { label: 'Sign in', url },
    footer: "If you didn't try to sign in, you can ignore this email.",
  });
}

export function reauthenticate(code: string): EmailContent {
  return render({
    subject: 'Your SageGames confirmation code',
    title: 'Confirm it’s you',
    intro: 'Enter this code to confirm the change to your account:',
    code,
    footer: "If you didn't request this, reset your password straight away.",
  });
}

export function passwordChanged(email: string): EmailContent {
  return render({
    subject: 'Your SageGames password was changed',
    title: 'Your password was changed',
    intro: `The password for your SageGames developer account <strong>${escapeHtml(email)}</strong> was just changed.`,
    footer: "If this wasn't you, reset your password from the sign-in page immediately and review your API keys.",
  });
}

export function genericNotice(email: string, action: string): EmailContent {
  return render({
    subject: 'Security notice for your SageGames account',
    title: 'Account activity',
    intro: `There was a change to your SageGames developer account <strong>${escapeHtml(email)}</strong> (${escapeHtml(action.replace(/_/g, ' '))}).`,
    footer: "If this wasn't you, reset your password from the sign-in page immediately.",
  });
}
