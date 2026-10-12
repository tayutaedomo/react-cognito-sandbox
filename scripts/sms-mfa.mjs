import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { awsRequest } from '../e2e/helpers/email-mfa-sandbox.mjs';
import {
  smsSandboxConfig,
  smsSandboxStatus,
  registerSmsDestination,
  verifySmsDestination,
  smsDeliveryRequest,
  requireSmsVerified,
  prepareSmsUser,
} from '../e2e/helpers/sms-mfa-sandbox.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
createRequire(new URL('../e2e/package.json', import.meta.url))('dotenv').config({ path: `${root}.env`, quiet: true });
try {
  const config = smsSandboxConfig(process.env);
  const command = process.argv[2];
  const fingerprint = createHash('sha256').update(config.to).digest('hex');
  const marker = `${root}.sms-mfa-delivery.json`;
  if (command === 'status') console.log(JSON.stringify(smsSandboxStatus(config)));
  else if (command === 'register') console.log(JSON.stringify(registerSmsDestination(config)));
  else if (command === 'verify') {
    verifySmsDestination(config, process.env.MFA_SMS_VERIFY_CODE?.trim());
    console.log('SMS sandbox destination verified.');
  } else if (command === 'delivery') {
    requireSmsVerified(config);
    if (existsSync(marker)) throw new Error('A delivery attempt is recorded. Do not resend automatically.');
    writeFileSync(marker, JSON.stringify({ fingerprint, attempted: true, confirmed: false }) + '\n', { mode: 0o600 });
    awsRequest('sns', 'publish', smsDeliveryRequest(config));
    console.log('Sent one SMS delivery-check message.');
  } else if (command === 'confirm-delivery') {
    const state = JSON.parse(readFileSync(marker, 'utf8'));
    if (state.fingerprint !== fingerprint || !state.attempted) throw new Error('Delivery configuration changed.');
    writeFileSync(marker, JSON.stringify({ ...state, confirmed: true }) + '\n', { mode: 0o600 });
    console.log('SMS receipt confirmation recorded.');
  } else if (command === 'user') {
    requireSmsVerified(config);
    const state = JSON.parse(readFileSync(marker, 'utf8'));
    if (state.fingerprint !== fingerprint || !state.confirmed) throw new Error('Confirm SMS receipt first.');
    const pool = process.env.MFA_EMAIL_USER_POOL_ID;
    const username = process.env.MFA_SMS_USER_EMAIL || process.env.MFA_EMAIL_TO;
    prepareSmsUser(config, pool, username);
    console.log('Dedicated user phone number ready. Verify ownership from MFA settings.');
  } else throw new Error('Use status, register, verify, delivery, confirm-delivery, or user.');
} catch (error) {
  console.error(error instanceof SyntaxError ? 'Invalid local state or AWS response.' : error.message);
  process.exitCode = 1;
}
