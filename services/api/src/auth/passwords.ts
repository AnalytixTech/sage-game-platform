/**
 * Portal passwords: Node's scrypt with a random salt per password. The parameters are stored with
 * the hash (scrypt$N$r$p$salt$hash), so they can be raised later without breaking old hashes.
 */
import crypto from 'crypto';

const KEY_LENGTH = 64;
/** Production cost (2^15, about 32 MB and tens of milliseconds per hash). Tests use a lower one. */
export const DEFAULT_SCRYPT_COST = 2 ** 15;

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) => (err ? reject(err) : resolve(key)))
  );
}

export async function hashPassword(password: string, cost = DEFAULT_SCRYPT_COST): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, cost, 8, 1);
  return `scrypt$${cost}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parts = (stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Same work for unknown accounts, so response times don't reveal which emails exist.
    await scrypt(password, Buffer.alloc(16), 2 ** 12, 8, 1);
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), Number(N), Number(r), Number(p));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Same rule as before: at least 10 characters, with upper and lower case letters and a digit. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters';
  if (password.length > 200) return 'Use at most 200 characters';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Include upper and lower case letters and a number';
  }
  return null;
}
