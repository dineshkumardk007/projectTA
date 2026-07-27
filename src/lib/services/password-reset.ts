import 'server-only';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { hashPassword } from '@/lib/auth/password';
import { DomainError } from '@/lib/api';
import { getEmailProvider } from '@/lib/providers/email';

/**
 * Password reset.
 *
 * Design constraints this file exists to satisfy:
 *
 *  • **No account enumeration.** Requesting a reset returns the same response
 *    whether or not the address exists.
 *  • **Only a hash is stored.** A leaked database must not let anyone reset an
 *    account, so the raw token exists solely inside the emailed link.
 *  • **Single use, short lived.** One hour, and consumed on success.
 *  • **Resetting signs you out everywhere.** `tokenVersion` is bumped, which
 *    invalidates every outstanding session — the usual reason for resetting is
 *    that someone else may have had access.
 */

const TOKEN_TTL_MINUTES = 60;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Always resolves. Callers must not branch on whether an account was found —
 * that is exactly the signal an attacker is looking for.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) return;

  // Any earlier link should stop working the moment a new one is issued.
  await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });

  const link = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${token}`;

  await getEmailProvider().send({
    to: user.email,
    subject: 'Reset your Takeaway password',
    body: [
      `Hi ${user.name.split(' ')[0]},`,
      '',
      'Use the link below to choose a new password. It expires in one hour and can only be used once.',
      '',
      link,
      '',
      'If you did not ask for this, you can ignore this email — your password will not change.',
      '',
      '— Takeaway',
    ].join('\n'),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, isActive: true } } },
  });

  // One message for every failure mode, so a probe cannot tell an unknown token
  // from an expired or already-used one.
  const invalid = new DomainError('That reset link is no longer valid. Please request a new one.', 400, 'invalid_token');

  if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.isActive) {
    throw invalid;
  }

  const passwordHash = await hashPassword(newPassword);

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      // Bumping tokenVersion invalidates every existing session for this user.
      data: { passwordHash, tokenVersion: { increment: 1 } },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
}
