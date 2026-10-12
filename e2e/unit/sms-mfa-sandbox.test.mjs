import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  smsSandboxConfig,
  registerSmsDestination,
  verifySmsDestination,
  smsDeliveryRequest,
  requireSmsVerified,
  prepareSmsUser,
} from '../helpers/sms-mfa-sandbox.mjs';
const config = { to: '+819012345678' };
function fixture({ verified = false, registered = false, sandbox = true } = {}) {
  const calls = [];
  return {
    calls,
    request: (service, operation, input) => {
      calls.push({ service, operation, input });
      if (operation === 'get-sms-sandbox-account-status') return { IsInSandbox: sandbox };
      if (operation === 'get-sms-attributes') return { attributes: { MonthlySpendLimit: '1' } };
      if (operation === 'list-sms-sandbox-phone-numbers')
        return {
          PhoneNumbers:
            registered || verified ? [{ PhoneNumber: config.to, Status: verified ? 'Verified' : 'Pending' }] : [],
        };
      return {};
    },
  };
}
test('requires a Japanese mobile number and never includes input in errors', () => {
  assert.deepEqual(smsSandboxConfig({ MFA_SMS_TO: ` ${config.to} ` }), config);
  for (const value of ['', '09012345678', '+12025550123', '+81312345678'])
    assert.throws(
      () => smsSandboxConfig({ MFA_SMS_TO: value }),
      (error) => !value || !error.message.includes(value),
    );
});
test('requests verification only for a missing destination', () => {
  const { request, calls } = fixture();
  assert.equal(registerSmsDestination(config, request).verificationRequested, true);
  assert.deepEqual(calls.at(-1).input, { PhoneNumber: config.to, LanguageCode: 'en-US' });
});
test('does not resend verification for a pending or verified number', () => {
  for (const verified of [false, true]) {
    const { request, calls } = fixture({ registered: true, verified });
    const result = registerSmsDestination(config, request);
    assert.equal(result.verificationRequested, false);
    assert.equal(JSON.stringify(result).includes(config.to), false);
    assert.equal(
      calls.some((call) => call.operation.startsWith('create')),
      false,
    );
  }
});
test('checks six digits before verification API calls', () => {
  const { request, calls } = fixture();
  assert.throws(() => verifySmsDestination(config, '12345', request));
  assert.equal(calls.length, 0);
  verifySmsDestination(config, '012345', request);
  assert.equal(calls[0].input.OneTimePassword, '012345');
});
test('delivery needs sandbox verification and sends one transactional short message', () => {
  assert.throws(() => requireSmsVerified(config, fixture().request));
  assert.throws(() => requireSmsVerified(config, fixture({ verified: true, sandbox: false }).request));
  requireSmsVerified(config, fixture({ verified: true }).request);
  const message = smsDeliveryRequest(config);
  assert.equal(message.PhoneNumber, config.to);
  assert.equal(message.Message.length < 160, true);
  assert.equal(message.MessageAttributes['AWS.SNS.SMS.SMSType'].StringValue, 'Transactional');
});

function userFixture({ phone, sms = true, recovery = 'admin_only' } = {}) {
  const updates = [];
  return {
    updates,
    request: (_service, operation, input) => {
      if (operation === 'describe-user-pool')
        return {
          UserPool: {
            MfaConfiguration: 'OPTIONAL',
            AccountRecoverySetting: { RecoveryMechanisms: [{ Name: recovery }] },
          },
        };
      if (operation === 'get-user-pool-mfa-config')
        return { SmsMfaConfiguration: sms ? { SmsConfiguration: { SnsCallerArn: 'test-role' } } : undefined };
      if (operation === 'admin-get-user')
        return { UserAttributes: phone ? [{ Name: 'phone_number', Value: phone }] : [] };
      updates.push(input);
      return {};
    },
  };
}
test('sets only the dedicated user phone and requires Cognito ownership verification', () => {
  const { request, updates } = userFixture();
  prepareSmsUser(config, 'test-pool', 'test@example.com', request);
  assert.deepEqual(updates, [
    {
      UserPoolId: 'test-pool',
      Username: 'test@example.com',
      UserAttributes: [
        { Name: 'phone_number', Value: config.to },
        { Name: 'phone_number_verified', Value: 'false' },
      ],
    },
  ]);
});
test('never overwrites a different phone or resets an existing same phone verification', () => {
  const same = userFixture({ phone: config.to });
  prepareSmsUser(config, 'test-pool', 'test@example.com', same.request);
  assert.equal(same.updates.length, 0);
  const other = userFixture({ phone: '+818012345678' });
  assert.throws(() => prepareSmsUser(config, 'test-pool', 'test@example.com', other.request));
  assert.equal(other.updates.length, 0);
});
test('blocks user mutation before SMS MFA or recovery configuration is ready', () => {
  for (const options of [{ sms: false }, { recovery: 'verified_email' }]) {
    const { request, updates } = userFixture(options);
    assert.throws(() => prepareSmsUser(config, 'test-pool', 'test@example.com', request));
    assert.equal(updates.length, 0);
  }
});
