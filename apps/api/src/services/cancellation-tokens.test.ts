import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_TOKEN_PATTERN,
  generateCancellationToken,
  hashCancellationToken,
  isValidCancellationTokenShape,
} from './cancellation-tokens.js';

describe('cancellation tokens', () => {
  it('generates 32-byte URL-safe tokens with no booking identifiers', () => {
    const first = generateCancellationToken();
    const second = generateCancellationToken();
    expect(first).toMatch(CANCELLATION_TOKEN_PATTERN);
    expect(first).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(first).not.toContain('AB-');
  });

  it('stores only a deterministic SHA-256 hash of the token', () => {
    const token = generateCancellationToken();
    const hash = hashCancellationToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashCancellationToken(token));
    expect(hash).not.toContain(token);
    expect(hashCancellationToken(generateCancellationToken())).not.toBe(hash);
  });

  it('rejects tokens that are malformed, empty, or too long', () => {
    expect(isValidCancellationTokenShape(generateCancellationToken())).toBe(
      true,
    );
    expect(isValidCancellationTokenShape(undefined)).toBe(false);
    expect(isValidCancellationTokenShape('')).toBe(false);
    expect(isValidCancellationTokenShape('short')).toBe(false);
    expect(isValidCancellationTokenShape('A'.repeat(44))).toBe(false);
    expect(isValidCancellationTokenShape(`${'A'.repeat(42)}!`)).toBe(false);
  });
});
