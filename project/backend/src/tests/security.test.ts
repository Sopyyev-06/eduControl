import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { decryptField, encryptField, maskPassport, maskPhone, maskPinfl } from '../core/crypto';
import { hashPassword, passwordProblems, randomPassword, verifyPassword } from '../core/password';
import { signAccessToken, verifyAccessToken, hashToken, newRefreshToken } from '../core/jwt';
import { can } from '../core/permissions';

test('pii: AES-256-GCM round trip and tamper detection', () => {
  const secret = '+993 65 123456';
  const enc = encryptField(secret);
  assert.ok(enc && enc.length > 0);
  assert.notEqual(enc!.toString('utf8').includes(secret), true, 'ciphertext must not contain plaintext');
  assert.equal(decryptField(enc), secret);

  const raw = enc!.toString('utf8').split('.');
  const ct = Buffer.from(raw[3], 'base64');
  ct[0] = ct[0] ^ 0xff;
  raw[3] = ct.toString('base64');
  assert.equal(decryptField(raw.join('.')), null, 'modified ciphertext must fail authentication');
  assert.equal(decryptField(null), null);
});

test('pii: masking never leaks full values', () => {
  assert.equal(maskPhone('+99365123456')!.includes('123456'), false);
  assert.ok(maskPhone('+99365123456')!.includes('56'));
  assert.equal(maskPassport('AB1234567')!.includes('1234567'), false);
  assert.equal(maskPinfl('12345678901234')!.includes('123456789012'), false);
});

test('passwords: scrypt hashing, verification and policy', async () => {
  const hash = await hashPassword('Str0ngPassw0rd!');
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('Str0ngPassw0rd!', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
  assert.equal(await verifyPassword('Str0ngPassw0rd!', 'garbage'), false);
  assert.deepEqual(passwordProblems('Str0ngPassw0rd!'), []);
  assert.ok(passwordProblems('short').length > 0);
  assert.ok(passwordProblems('password123').length > 0);
  const generated = randomPassword(16);
  assert.equal(passwordProblems(generated).length, 0);
});

test('jwt: signature, claims and algorithm confusion are rejected', () => {
  const token = signAccessToken({ sub: 7, role: 'dean', facultyId: 1, pwdChanged: true });
  const claims = verifyAccessToken(token);
  assert.equal(claims?.sub, 7);
  assert.equal(claims?.role, 'dean');

  const parts = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims, role: 'rector' })).toString('base64url');
  assert.equal(verifyAccessToken(`${parts[0]}.${forged}.${parts[2]}`), null, 'payload tampering must fail');

  const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  assert.equal(verifyAccessToken(`${noneHeader}.${parts[1]}.`), null, 'alg=none must fail');

  assert.equal(verifyAccessToken('not.a.token'), null);
  assert.equal(verifyAccessToken(parts[0] + '.' + parts[1] + '.' + 'A'.repeat(43)), null);
});

test('refresh tokens are random, hashed and unique', () => {
  const a = newRefreshToken();
  const b = newRefreshToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
});

test('rbac matrix denies unknown roles and outsiders', () => {
  assert.equal(can('rector', 'AUDIT_READ'), true);
  assert.equal(can('teacher', 'AUDIT_READ'), false);
  assert.equal(can('vice_dean', 'PII_READ'), false);
  assert.equal(can('dean', 'PII_READ'), true);
  assert.equal(can('teacher', 'REPORT_CREATE'), false);
  assert.equal(can(null, 'STUDENT_READ'), false);
  assert.equal(can('hacker', 'STUDENT_READ'), false);
});
