import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateTotp } from '../helpers/totp.mjs';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
// RFC 6238 Appendix B の SHA-1 結果を6桁に切り詰めたもの。
for (const [seconds, expected] of [
  [59, '287082'], [1111111109, '081804'], [1111111111, '050471'],
  [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130'],
]) {
  test(`RFC 6238 vector at ${seconds}`, () => {
    assert.equal(generateTotp(secret, seconds * 1000), expected);
  });
}
test('spaces and lowercase are accepted', () => {
  assert.equal(generateTotp('gez dgnbvgy3tqojqgez dgnbvgy3tqojq', 59000), '287082');
});
test('code changes at the 30-second boundary', () => {
  assert.equal(generateTotp(secret, 59999), '287082');
  assert.notEqual(generateTotp(secret, 60000), '287082');
});
test('invalid secrets and timestamps are rejected without exposing the secret', () => {
  for (const invalid of ['', '12345678', 'A', `${secret}B`, `${secret}=`]) {
    assert.throws(() => generateTotp(invalid, 59000), /TEST_USER_TOTP_SECRET/);
  }
  for (const timestamp of [-1, NaN, Infinity, 0.5]) {
    assert.throws(() => generateTotp(secret, timestamp), /timestamp/);
  }
});
