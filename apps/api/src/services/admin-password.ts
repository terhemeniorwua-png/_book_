import argon2 from 'argon2';

export function validateInitialAdminPassword(password: string): void {
  if (password.length < 14 || password.length > 128) {
    throw new Error(
      'Initial administrator password must contain 14 to 128 characters.',
    );
  }
}

export function hashAdminPassword(password: string): Promise<string> {
  validateInitialAdminPassword(password);
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });
}
