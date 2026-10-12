import { describe, expect, it, vi } from 'vitest';
import { createMfaService, mfaErrorMessage } from '../src/auth/mfaService';

function fixture() {
  const api = {
    fetchMFAPreference: vi.fn().mockResolvedValue({ enabled: [] }),
    setUpTOTP: vi.fn().mockResolvedValue({
      sharedSecret: 'MOCKSECRET',
      getSetupUri: () => new URL('otpauth://totp/Sandbox?secret=MOCKSECRET'),
    }),
    verifyTOTPSetup: vi.fn().mockResolvedValue(undefined),
    fetchUserAttributes: vi.fn().mockResolvedValue({ email: 'test@example.com', email_verified: 'true' }),
    sendUserAttributeVerificationCode: vi.fn().mockResolvedValue(undefined),
    confirmUserAttribute: vi.fn().mockResolvedValue(undefined),
    updateMFAPreference: vi.fn().mockResolvedValue(undefined),
  };
  return { api, service: createMfaService(api) };
}

describe('MFA settings service', () => {
  it('does not infer stored registration from absent enabled preferences', async () => {
    const { service } = fixture();
    expect(await service.getPreference()).toMatchObject({
      enabled: false,
      preferred: false,
      raw: { enabled: [] },
    });
  });

  it('reads enabled TOTP independently of other factors', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS', 'TOTP'], preferred: 'TOTP' });
    expect(await service.getPreference()).toMatchObject({
      enabled: true,
      preferred: true,
      raw: { enabled: ['SMS', 'TOTP'], preferred: 'TOTP' },
    });
  });

  it('does not treat another factor as TOTP enabled', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS'], preferred: 'SMS' });
    expect(await service.getPreference()).toMatchObject({
      enabled: false,
      preferred: false,
      raw: { enabled: ['SMS'], preferred: 'SMS' },
    });
  });

  it('returns a local authenticator URI without enabling MFA', async () => {
    const { api, service } = fixture();
    expect(await service.startSetup()).toEqual({
      secret: 'MOCKSECRET',
      uri: 'otpauth://totp/Sandbox?secret=MOCKSECRET',
    });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });

  it.each(['', '12345', '1234567', '12a456', '１２３４５６'])(
    'rejects invalid code %j before API calls',
    async (code) => {
      const { api, service } = fixture();
      await expect(service.verifySetup(code)).rejects.toMatchObject({ name: 'InvalidTotpCode' });
      expect(api.verifyTOTPSetup).not.toHaveBeenCalled();
      expect(api.updateMFAPreference).not.toHaveBeenCalled();
    },
  );

  it('preserves leading zeroes and trims input when verifying', async () => {
    const { api, service } = fixture();
    await service.verifySetup(' 012345 ');
    expect(api.verifyTOTPSetup).toHaveBeenCalledWith({ code: '012345' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });

  it('propagates verification failure so registration can be retried', async () => {
    const { api, service } = fixture();
    const error = Object.assign(new Error('secret detail'), { name: 'CodeMismatchException' });
    api.verifyTOTPSetup.mockRejectedValue(error);
    await expect(service.verifySetup('123456')).rejects.toBe(error);
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });

  it('enables verified TOTP as preferred without creating a new secret', async () => {
    const { api, service } = fixture();
    await service.setTotpEnabled(true);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'PREFERRED' });
    expect(api.setUpTOTP).not.toHaveBeenCalled();
  });

  it('distinguishes verification mismatch from enabling an unregistered factor', async () => {
    const { api, service } = fixture();
    api.verifyTOTPSetup.mockRejectedValue({ name: 'EnableSoftwareTokenMFAException' });
    await expect(service.verifySetup('000000')).rejects.toMatchObject({
      name: 'CodeMismatchException',
    });
    api.updateMFAPreference.mockRejectedValue({ name: 'EnableSoftwareTokenMFAException' });
    await expect(service.setTotpEnabled(true)).rejects.toMatchObject({
      name: 'EnableSoftwareTokenMFAException',
    });
  });

  it('disables TOTP preference without changing its association', async () => {
    const { api, service } = fixture();
    await service.setTotpEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'DISABLED' });
    expect(api.setUpTOTP).not.toHaveBeenCalled();
    expect(api.verifyTOTPSetup).not.toHaveBeenCalled();
  });

  it('allows enabling alone to be retried after preference failure', async () => {
    const { api, service } = fixture();
    await service.verifySetup('123456');
    api.updateMFAPreference.mockRejectedValueOnce(new Error('temporary failure'));
    await expect(service.setTotpEnabled(true)).rejects.toThrow();
    await service.setTotpEnabled(true);
    expect(api.verifyTOTPSetup).toHaveBeenCalledTimes(1);
    expect(api.updateMFAPreference).toHaveBeenCalledTimes(2);
    expect(api.setUpTOTP).not.toHaveBeenCalled();
  });

  it('does not expose service messages or secrets in UI errors', () => {
    expect(mfaErrorMessage(new Error('secret=ABC token=XYZ'))).not.toMatch(/ABC|XYZ/);
    expect(mfaErrorMessage({ name: 'CodeMismatchException' })).toContain('コード');
    expect(mfaErrorMessage({ name: 'EnableSoftwareTokenMFAException' })).toContain('登録');
    expect(mfaErrorMessage({ name: 'NotAuthorizedException' })).toContain('ログイン');
  });
});

describe('email and preferred MFA', () => {
  it('preserves TOTP preference when adding email', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP'], preferred: 'TOTP' });
    await service.setEmailEnabled(true);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ email: 'ENABLED' });
  });
  it('makes the remaining method preferred when disabling TOTP', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL'], preferred: 'TOTP' });
    await service.setTotpEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'DISABLED', email: 'PREFERRED' });
  });
  it.each(['TOTP', 'EMAIL', null] as const)('saves preference %s independently of enabled methods', async (method) => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL'] });
    await service.setPreferred(method);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({
      totp: method === 'TOTP' ? 'PREFERRED' : 'NOT_PREFERRED',
      email: method === 'EMAIL' ? 'PREFERRED' : 'NOT_PREFERRED',
    });
  });
  it('rejects email activation before email ownership is verified', async () => {
    const { api, service } = fixture();
    api.fetchUserAttributes.mockResolvedValue({ email: 'test@example.com', email_verified: 'false' });
    await expect(service.setEmailEnabled(true)).rejects.toMatchObject({ name: 'UnverifiedMfaEmail' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });
  it('rejects selection without two enabled methods', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP'] });
    await expect(service.setPreferred(null)).rejects.toMatchObject({ name: 'InvalidMfaPreference' });
    await expect(service.setPreferred('EMAIL')).rejects.toMatchObject({ name: 'InvalidMfaPreference' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });
  it('verifies email separately from MFA activation', async () => {
    const { api, service } = fixture();
    await service.sendEmailVerification();
    await service.verifyEmail(' 012345 ');
    expect(api.confirmUserAttribute).toHaveBeenCalledWith({ userAttributeKey: 'email', confirmationCode: '012345' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });
});

it('does not permit email activation before the environment is ready', async () => {
  const { api } = fixture();
  const service = createMfaService(api, { emailAvailable: false });
  await expect(service.setEmailEnabled(true)).rejects.toMatchObject({ name: 'EmailMfaUnavailable' });
  expect(api.updateMFAPreference).not.toHaveBeenCalled();
});

describe('SMS and three-factor preferences', () => {
  it('reads SMS independently and enables it only after phone verification', async () => {
    const { api, service } = fixture();
    api.fetchUserAttributes.mockResolvedValue({ phone_number: '+819012345678', phone_number_verified: 'true' });
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL'], preferred: 'EMAIL' });
    await service.setSmsEnabled(true);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ sms: 'ENABLED' });
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS'], preferred: 'SMS' });
    expect(await service.getPreference()).toMatchObject({ smsEnabled: true, enabled: false, emailEnabled: false });
  });
  it('blocks unverified or unavailable SMS without saving settings', async () => {
    const { api, service } = fixture();
    await expect(service.setSmsEnabled(true)).rejects.toMatchObject({ name: 'UnverifiedMfaPhone' });
    const unavailable = createMfaService(api, { emailAvailable: true, smsAvailable: false });
    await expect(unavailable.setSmsEnabled(true)).rejects.toMatchObject({ name: 'SmsMfaUnavailable' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });
  it.each(['TOTP', 'EMAIL', 'SMS', null] as const)('sets three-factor preference %s', async (method) => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL', 'SMS'] });
    await service.setPreferred(method);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({
      totp: method === 'TOTP' ? 'PREFERRED' : 'NOT_PREFERRED',
      email: method === 'EMAIL' ? 'PREFERRED' : 'NOT_PREFERRED',
      sms: method === 'SMS' ? 'PREFERRED' : 'NOT_PREFERRED',
    });
  });
  it('clears a disabled preferred factor and keeps two others available for selection', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL', 'SMS'], preferred: 'SMS' });
    await service.setSmsEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({
      sms: 'DISABLED',
      totp: 'NOT_PREFERRED',
      email: 'NOT_PREFERRED',
    });
  });
  it('does not change another preferred factor when disabling one of three', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'EMAIL', 'SMS'], preferred: 'EMAIL' });
    await service.setSmsEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ sms: 'DISABLED' });
  });
  it('makes SMS preferred when it is the only remaining factor', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['TOTP', 'SMS'], preferred: 'TOTP' });
    await service.setTotpEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'DISABLED', sms: 'PREFERRED' });
  });
  it('reads and verifies phone ownership separately from MFA', async () => {
    const { api, service } = fixture();
    api.fetchUserAttributes.mockResolvedValue({ phone_number: '+819012345678', phone_number_verified: 'false' });
    expect(await service.getPhone()).toEqual({ address: '+819012345678', verified: false });
    await service.sendPhoneVerification();
    await service.verifyPhone(' 012345 ');
    expect(api.sendUserAttributeVerificationCode).toHaveBeenCalledWith({ userAttributeKey: 'phone_number' });
    expect(api.confirmUserAttribute).toHaveBeenCalledWith({
      userAttributeKey: 'phone_number',
      confirmationCode: '012345',
    });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });
});
