// Unit tests for the pure security logic: TOTP, secret sealing, and the CSP
// builder. Run with `pnpm --filter @workspace/cms-api test`. The end-to-end
// auth and header behaviour is exercised against a running server separately.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { addNonce, buildAdminCsp, buildPageCsp, newNonce } from '../src/lib/security.ts';
import { base32Encode, decryptSecret, encryptSecret, generateBackupCodes, generateTotpSecret, totpUri, verifyTotp } from '../src/lib/totp.ts';

// A reference TOTP, independent of the implementation under test.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s: string) {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, '')) { value = (value << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function reference(secret: string) {
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(code % 1e6).padStart(6, '0');
}

test('base32 round-trips bytes', () => {
  const buf = Buffer.from('veyra-secret-bytes!!');
  assert.equal(base32Encode(buf), base32Encode(buf));
  assert.match(base32Encode(buf), /^[A-Z2-7]+$/);
});

test('generated TOTP secret is 32 base32 chars (160-bit)', () => {
  const s = generateTotpSecret();
  assert.equal(s.length, 32);
  assert.match(s, /^[A-Z2-7]+$/);
});

test('verifyTotp accepts the current code and rejects wrong/malformed ones', () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, reference(secret)), true);
  assert.equal(verifyTotp(secret, '000000'), false);
  assert.equal(verifyTotp(secret, '12345'), false);
  assert.equal(verifyTotp(secret, 'abcdef'), false);
  assert.equal(verifyTotp(secret, ''), false);
});

test('otpauth URI carries the issuer, secret and algorithm', () => {
  const uri = totpUri('JBSWY3DPEHPK3PXP', 'me@example.com', 'Veyra');
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=Veyra/);
  assert.match(uri, /algorithm=SHA1/);
});

test('TOTP secret encryption round-trips and is non-reversible without the key', () => {
  const secret = generateTotpSecret();
  const sealed = encryptSecret(secret);
  assert.notEqual(sealed, secret);
  assert.equal(decryptSecret(sealed), secret);
  // A tampered ciphertext must not decrypt (GCM auth tag).
  assert.throws(() => decryptSecret(sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A')));
});

test('backup codes are unique, formatted and the requested count', () => {
  const codes = generateBackupCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[0-9a-f]{5}-[0-9a-f]{5}$/);
});

test('page CSP is strict: nonce, no object/base escape, framing locked down', () => {
  const nonce = newNonce();
  const csp = buildPageCsp({ nonce, security: baseSecurity(), site: { googleAnalyticsId: '', googleTagManagerId: '' }, https: true });
  assert.match(csp, new RegExp(`script-src 'self' 'nonce-${nonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.ok(!csp.includes("script-src 'self' 'nonce-" + nonce + "' 'unsafe-inline'"));
});

test('analytics origins appear only when a GA/GTM id is configured', () => {
  const nonce = newNonce();
  const off = buildPageCsp({ nonce, security: baseSecurity(), site: { googleAnalyticsId: '', googleTagManagerId: '' }, https: false });
  assert.ok(!off.includes('googletagmanager.com'));
  const on = buildPageCsp({ nonce, security: baseSecurity(), site: { googleAnalyticsId: 'G-XXXX', googleTagManagerId: '' }, https: false });
  assert.match(on, /script-src[^;]*googletagmanager\.com/);
  assert.ok(!on.includes('upgrade-insecure-requests')); // http → omitted
});

test('extra configured sources are appended to the CSP', () => {
  const nonce = newNonce();
  const csp = buildPageCsp({ nonce, security: { ...baseSecurity(), cspScriptSrc: ['https://cdn.example.com'], cspFrameSrc: ['https://widget.example.com'] }, site: { googleAnalyticsId: '', googleTagManagerId: '' }, https: true });
  assert.match(csp, /script-src[^;]*https:\/\/cdn\.example\.com/);
  assert.match(csp, /frame-src[^;]*https:\/\/widget\.example\.com/);
});

test('admin CSP forbids framing and inline script', () => {
  const csp = buildAdminCsp();
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self'/);
  assert.ok(!csp.includes("'unsafe-inline'") || /style-src[^;]*'unsafe-inline'/.test(csp));
});

test('addNonce nonces bare script tags but leaves already-nonced ones', () => {
  assert.equal(addNonce('<script>x()</script>', 'ABC'), '<script nonce="ABC">x()</script>');
  assert.equal(addNonce('<script nonce="Z">y()</script>', 'ABC'), '<script nonce="Z">y()</script>');
  assert.equal(addNonce('<p>no scripts</p>', 'ABC'), '<p>no scripts</p>');
});

function baseSecurity() {
  return {
    requireTwoFactor: false,
    alertOnNewDeviceLogin: true,
    cspEnabled: true,
    cspReportOnly: false,
    cspScriptSrc: [] as string[],
    cspConnectSrc: [] as string[],
    cspFrameSrc: [] as string[],
    cspImgSrc: [] as string[],
    cspStyleSrc: [] as string[],
    cspFontSrc: [] as string[],
  };
}
