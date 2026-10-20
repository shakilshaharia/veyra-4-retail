// Time-based one-time passwords (RFC 6238) for optional two-factor sign-in,
// implemented on node:crypto so there is no third-party dependency in the auth
// path. Compatible with Google Authenticator, 1Password, Authy, etc.: SHA-1,
// 6 digits, 30-second period.

import { createDecipheriv, createCipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { env } from '../env.ts';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD = 30;

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A fresh 160-bit secret, in the base32 form authenticator apps expect.
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

// Accept the current code plus one step either side, to tolerate clock skew.
export function verifyTotp(secretBase32: string, token: string, window = 1) {
  const candidate = token.replace(/\D/g, '');
  if (candidate.length !== DIGITS) return false;
  const secret = base32Decode(secretBase32);
  if (!secret.length) return false;
  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let i = -window; i <= window; i += 1) {
    const expected = hotp(secret, counter + i);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}

// The otpauth:// URI a QR code encodes for the authenticator app.
export function totpUri(secretBase32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Recovery codes, shown to the user once and stored only as hashes.
export function generateBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

// --- Secret encryption at rest --------------------------------------------
// A database dump should not hand an attacker working second factors, so the
// TOTP secret is sealed with AES-256-GCM under a key derived from APP_SECRET.

const KEY = scryptSync(env.APP_SECRET, 'veyra-totp-secret-v1', 32);

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(stored: string) {
  const [iv, tag, enc] = stored.split(':');
  if (!iv || !tag || !enc) throw new Error('Malformed secret');
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64')), decipher.final()]).toString('utf8');
}
