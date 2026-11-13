import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes, scryptSync } from 'node:crypto';
import { verifyAdminPassword } from '../server/session';
describe('administrator password verification', () => {
  afterEach(() => { delete process.env['ADMIN_PASSWORD_HASH']; });
  it('accepts only the correct scrypt password', () => {
    const salt = randomBytes(16); const password = 'synthetic-long-school-password';
    process.env['ADMIN_PASSWORD_HASH'] = `scrypt$32768$8$3$${salt.toString('hex')}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
    expect(verifyAdminPassword(password)).toBe(true); expect(verifyAdminPassword('wrong-password')).toBe(false);
  });
  it('fails closed without a configured hash', () => { expect(() => verifyAdminPassword('anything')).toThrow('unavailable'); });
});
