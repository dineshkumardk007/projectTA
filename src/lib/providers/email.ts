import 'server-only';
import { env } from '@/lib/env';

/**
 * Transactional email.
 *
 * Same shape as the other providers: a local implementation that works with no
 * credentials, and one seam to replace when a real sender is configured. The
 * mock prints the message (including any reset link) to the server console, so
 * password reset is fully testable in development without an SMTP account.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text. Deliberately not HTML — these are short operational messages. */
  body: string;
};

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    console.info(
      [
        '',
        '─── email (console provider) ───────────────────────────',
        `to:      ${message.to}`,
        `subject: ${message.subject}`,
        '',
        message.body,
        '────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  }
}

/**
 * Ready for a real sender. Resend is assumed because it is a single HTTP call
 * with no SDK, but any provider fits this interface.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      }),
    });

    if (!response.ok) {
      throw new Error(`Email delivery failed (${response.status}).`);
    }
  }
}

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  cached =
    env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY
      ? new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM)
      : new ConsoleEmailProvider();
  return cached;
}
