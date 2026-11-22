import { createHash, randomBytes } from 'crypto';

export const API_KEY_PREFIX = 'nsk_';

/** Generates a high-entropy secret API key, e.g. nsk_3q2...; only its hash is stored. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

/** SHA-256 is appropriate for API keys because they are random 256-bit secrets (not passwords). */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
