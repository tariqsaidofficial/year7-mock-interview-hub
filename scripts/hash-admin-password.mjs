import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

if (!stdin.isTTY || !stdout.isTTY) throw new Error('Run in a private terminal.');
const prompt = createInterface({ input: stdin, output: stdout, terminal: true });
try {
  const password = await prompt.question('Enter a unique administrator password (20+ characters): ', { hideEchoBack: true });
  if (password.length < 20 || password.length > 256) throw new Error('Password must have 20 to 256 characters.');
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  stdout.write(`ADMIN_PASSWORD_HASH=scrypt$32768$8$3$${salt.toString('hex')}$${hash.toString('hex')}\n`);
} finally { prompt.close(); }
