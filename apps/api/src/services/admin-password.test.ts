import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import {
  hashAdminPassword,
  validateInitialAdminPassword,
} from './admin-password.js';

describe('administrator password provisioning', () => {
  it('requires a sufficiently long one-time password', () => {
    expect(() => validateInitialAdminPassword('short')).toThrow();
    expect(() => validateInitialAdminPassword('a'.repeat(129))).toThrow();
  });

  it('stores an Argon2id hash that verifies without retaining the password', async () => {
    const password = 'correct horse battery staple 2035';
    const hash = await hashAdminPassword(password);
    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(hash, password)).resolves.toBe(true);
    await expect(argon2.verify(hash, 'wrong password')).resolves.toBe(false);
  }, 15_000);
});
