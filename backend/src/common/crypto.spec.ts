import { API_KEY_PREFIX, generateApiKey, hashApiKey } from './crypto';

describe('API key crypto', () => {
  it('generates unique, prefixed, high-entropy keys', () => {
    const keys = new Set(Array.from({ length: 100 }, generateApiKey));
    expect(keys.size).toBe(100);
    for (const k of keys) {
      expect(k.startsWith(API_KEY_PREFIX)).toBe(true);
      expect(k.length).toBeGreaterThanOrEqual(API_KEY_PREFIX.length + 43);
    }
  });

  it('hashes deterministically without containing the key', () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(key)).not.toContain(key);
  });
});
