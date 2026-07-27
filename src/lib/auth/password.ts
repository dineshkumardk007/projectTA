import 'server-only';
import bcrypt from 'bcryptjs';

/**
 * bcryptjs (pure JS) rather than native bcrypt: no compiler toolchain needed,
 * which matters because merchants' machines are not the only place this builds.
 * Cost 12 is ~250ms on commodity hardware — slow enough to matter, fast enough
 * that a counter login does not feel broken.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
