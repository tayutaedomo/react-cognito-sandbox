import { awsRequest } from './email-mfa-sandbox.mjs';

export function smsSandboxConfig(env) {
  const to = env.MFA_SMS_TO?.trim();
  if (!/^\+81(?:70|80|90)[0-9]{8}$/.test(to ?? ''))
    throw new Error('Set MFA_SMS_TO to a Japanese mobile number in +81 format.');
  return { to };
}

export function smsSandboxStatus(config, request = awsRequest) {
  const sandbox = request('sns', 'get-sms-sandbox-account-status', {}).IsInSandbox;
  const attributes = request('sns', 'get-sms-attributes', { attributes: ['MonthlySpendLimit'] }).attributes;
  const numbers = request('sns', 'list-sms-sandbox-phone-numbers', {}).PhoneNumbers ?? [];
  return {
    sandbox: sandbox === true,
    monthlySpendLimit: attributes?.MonthlySpendLimit,
    verified: numbers.some((number) => number.PhoneNumber === config.to && number.Status === 'Verified'),
    registered: numbers.some((number) => number.PhoneNumber === config.to),
  };
}

export function registerSmsDestination(config, request = awsRequest) {
  const status = smsSandboxStatus(config, request);
  if (!status.sandbox) throw new Error('This POC requires the SMS sandbox.');
  if (status.registered) return { ...status, verificationRequested: false };
  request('sns', 'create-sms-sandbox-phone-number', { PhoneNumber: config.to, LanguageCode: 'en-US' });
  return { ...status, verificationRequested: true };
}

export function verifySmsDestination(config, code, request = awsRequest) {
  if (!/^[0-9]{6}$/.test(code ?? '')) throw new Error('Set MFA_SMS_VERIFY_CODE to the six-digit verification code.');
  request('sns', 'verify-sms-sandbox-phone-number', { PhoneNumber: config.to, OneTimePassword: code });
}

export function smsDeliveryRequest(config) {
  return {
    PhoneNumber: config.to,
    Message: 'SMS MFA POC: delivery check. No sign-in code is included.',
    MessageAttributes: { 'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' } },
  };
}

export function requireSmsVerified(config, request = awsRequest) {
  const status = smsSandboxStatus(config, request);
  if (!status.sandbox || !status.verified) throw new Error('Verify the destination in the SMS sandbox first.');
}

export function prepareSmsUser(config, pool, username, request = awsRequest) {
  if (!pool || !username) throw new Error('Set the pool and dedicated test user in .env.');
  const currentPool = request('cognito-idp', 'describe-user-pool', { UserPoolId: pool }).UserPool;
  const mfa = request('cognito-idp', 'get-user-pool-mfa-config', { UserPoolId: pool });
  if (
    currentPool.MfaConfiguration !== 'OPTIONAL' ||
    !mfa.SmsMfaConfiguration?.SmsConfiguration?.SnsCallerArn ||
    currentPool.AccountRecoverySetting?.RecoveryMechanisms?.[0]?.Name !== 'admin_only'
  )
    throw new Error('Apply the SMS MFA pool configuration first.');
  const user = request('cognito-idp', 'admin-get-user', { UserPoolId: pool, Username: username });
  const current = user.UserAttributes?.find((attribute) => attribute.Name === 'phone_number')?.Value;
  if (current && current !== config.to)
    throw new Error('The user has a different phone number; no overwrite performed.');
  if (!current)
    request('cognito-idp', 'admin-update-user-attributes', {
      UserPoolId: pool,
      Username: username,
      UserAttributes: [
        { Name: 'phone_number', Value: config.to },
        { Name: 'phone_number_verified', Value: 'false' },
      ],
    });
}
