import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  emailSandboxConfig,
  awsRequest,
  prepareIdentities,
  requireVerified,
  deliveryRequest,
} from '../e2e/helpers/email-mfa-sandbox.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../e2e/package.json', import.meta.url));
require('dotenv').config({ path: `${root}.env`, quiet: true });

try {
  const config = emailSandboxConfig(process.env);
  const command = process.argv[2];
  const marker = `${root}.email-mfa-delivery.json`;
  const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
  if (command === 'identities') {
    console.log(JSON.stringify(await prepareIdentities(config)));
  } else if (command === 'status') {
    const account = awsRequest('sesv2', 'get-account', {});
    console.log(
      JSON.stringify({
        sandbox: !account.ProductionAccessEnabled,
        sendingEnabled: account.SendingEnabled,
        quota: account.SendQuota,
      }),
    );
    for (const [label, address] of [
      ['sender', config.from],
      ['recipient', config.to],
    ]) {
      const identity = awsRequest('sesv2', 'get-email-identity', { EmailIdentity: address });
      console.log(JSON.stringify({ label, verified: identity.VerifiedForSendingStatus === true }));
    }
  } else if (command === 'delivery') {
    requireVerified(config);
    if (existsSync(marker))
      throw new Error(
        'A delivery attempt is already recorded. Confirm receipt before proceeding; do not resend automatically.',
      );
    // 送信失敗や応答不明でも自動再送しない。
    writeFileSync(marker, JSON.stringify({ fingerprint, attempted: true, confirmed: false }) + '\n', { mode: 0o600 });
    awsRequest('sesv2', 'send-email', deliveryRequest(config));
    console.log('Sent one delivery-check email. Confirm receipt in Gmail, including spam.');
  } else if (command === 'confirm-delivery') {
    const state = JSON.parse(readFileSync(marker, 'utf8'));
    if (state.fingerprint !== fingerprint || !state.attempted) throw new Error('Delivery configuration changed.');
    writeFileSync(marker, JSON.stringify({ ...state, confirmed: true }) + '\n', { mode: 0o600 });
    console.log('Receipt confirmation recorded.');
  } else if (command === 'tfvars' || command === 'user') {
    requireVerified(config);
    const state = JSON.parse(readFileSync(marker, 'utf8'));
    if (state.fingerprint !== fingerprint || !state.confirmed)
      throw new Error('Confirm Gmail receipt before changing Cognito.');
    const pool = process.env.MFA_EMAIL_USER_POOL_ID;
    if (command === 'tfvars') {
      const account = awsRequest('sts', 'get-caller-identity', {}).Account;
      writeFileSync(
        `${root}terraform/app/email-identity.auto.tfvars.json`,
        JSON.stringify({ ses_email_identity_arn: `arn:aws:ses:ap-northeast-1:${account}:identity/${config.from}` }) +
          '\n',
        { mode: 0o600 },
      );
      console.log('Generated Git-ignored SES identity tfvars. Apply only with the MFA email overlay.');
    } else {
      const password = process.env.MFA_EMAIL_USER_PASSWORD;
      if (
        !pool ||
        !password ||
        password.length < 8 ||
        !/[a-z]/.test(password) ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^a-zA-Z0-9]/.test(password)
      )
        throw new Error('Set MFA_EMAIL_USER_POOL_ID and a password meeting the pool policy.');
      const current = awsRequest('cognito-idp', 'describe-user-pool', { UserPoolId: pool }).UserPool;
      if (!current.UserPoolTier) throw new Error('AWS CLI is too old to read UserPoolTier. Use a current AWS CLI.');
      if (
        current.MfaConfiguration !== 'OPTIONAL' ||
        current.EmailConfiguration?.EmailSendingAccount !== 'DEVELOPER' ||
        current.EmailConfiguration?.SourceArn?.split('/').slice(1).join('/') !== config.from ||
        !current.SoftwareTokenMfaConfiguration?.Enabled ||
        !['ESSENTIALS', 'PLUS'].includes(current.UserPoolTier) ||
        current.AccountRecoverySetting?.RecoveryMechanisms?.[0]?.Name !== 'admin_only'
      )
        throw new Error('Apply and verify the email MFA POC pool configuration first.');
      const users =
        awsRequest('cognito-idp', 'list-users', { UserPoolId: pool, Filter: `email = "${config.to}"`, Limit: 1 })
          .Users ?? [];
      if (!users.length)
        awsRequest('cognito-idp', 'admin-create-user', {
          UserPoolId: pool,
          Username: config.to,
          MessageAction: 'SUPPRESS',
          UserAttributes: [
            { Name: 'email', Value: config.to },
            { Name: 'email_verified', Value: 'true' },
          ],
        });
      if (users.length)
        throw new Error('The recipient already has a user. Existing passwords will not be overwritten.');
      awsRequest('cognito-idp', 'admin-set-user-password', {
        UserPoolId: pool,
        Username: config.to,
        Password: password,
        Permanent: true,
      });
      console.log('Created a confirmed dedicated user without an invitation email.');
    }
  } else throw new Error('Use identities, status, delivery, confirm-delivery, tfvars, or user.');
} catch (error) {
  // エラー文は上記の固定メッセージだけ。AWS の生の応答は表示しない。
  console.error(error instanceof SyntaxError ? 'Invalid local state or AWS response.' : error.message);
  process.exitCode = 1;
}
