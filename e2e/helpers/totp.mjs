import { createHmac } from 'node:crypto';

// RFC 6238: Cognito が受け付ける SHA-1 / 30秒 / 6桁の TOTP。
export function generateTotp(secret, timestamp = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = secret.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z2-7]+$/.test(normalized)) {
    throw new Error('TEST_USER_TOTP_SECRET must be an unpadded Base32 secret');
  }
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new Error('TOTP timestamp must be a non-negative integer');
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of normalized) {
    value = (value << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
      value &= (1 << bits) - 1;
    }
  }
  if (bytes.length < 10 || value !== 0 || ![0, 2, 4, 5, 7].includes(normalized.length % 8)) {
    throw new Error('TEST_USER_TOTP_SECRET must encode at least 80 bits in valid Base32');
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timestamp / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 1_000_000).padStart(6, '0');
}
