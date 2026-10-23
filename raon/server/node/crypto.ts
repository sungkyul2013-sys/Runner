import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Crypto } from '../core/http';

const N = 16384;

export const nodeCrypto: Crypto = {
  hashPassword(pw) {
    const salt = randomBytes(16);
    const hash = scryptSync(pw.normalize('NFC'), salt, 32, { N });
    return `scrypt$${N}$${salt.toString('base64')}$${hash.toString('base64')}`;
  },
  verifyPassword(pw, stored) {
    const [algo, n, salt, hash] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptSync(pw.normalize('NFC'), Buffer.from(salt, 'base64'), expected.length, { N: Number(n) });
    return timingSafeEqual(actual, expected);
  },
  randomToken: () => randomBytes(32).toString('base64url'),
  hashToken: (t) => createHash('sha256').update(t).digest('hex'),
};
