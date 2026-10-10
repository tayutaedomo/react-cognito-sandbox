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
    updateMFAPreference: vi.fn().mockResolvedValue(undefined),
  };
  return { api, service: createMfaService(api) };
}

describe('MFA settings service', () => {
  it('does not infer stored registration from absent enabled preferences', async () => {
    const { service } = fixture();
    expect(await service.getPreference()).toEqual({ enabled: false, preferred: false });
  });

  it('reads enabled TOTP independently of other factors', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS', 'TOTP'], preferred: 'TOTP' });
    expect(await service.getPreference()).toEqual({ enabled: true, preferred: true });
  });

  it('does not treat another factor as TOTP enabled', async () => {
    const { api, service } = fixture();
    api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS'], preferred: 'SMS' });
    expect(await service.getPreference()).toEqual({ enabled: false, preferred: false });
  });

  it('returns a local authenticator URI without enabling MFA', async () => {
    const { api, service } = fixture();
    expect(await service.startSetup()).toEqual({ secret: 'MOCKSECRET', uri: 'otpauth://totp/Sandbox?secret=MOCKSECRET' });
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });

  it.each(['', '12345', '1234567', '12a456', '１２３４５６'])('rejects invalid code %j before API calls', async code => {
    const { api, service } = fixture();
    await expect(service.verifySetup(code)).rejects.toMatchObject({ name: 'InvalidTotpCode' });
    expect(api.verifyTOTPSetup).not.toHaveBeenCalled();
    expect(api.updateMFAPreference).not.toHaveBeenCalled();
  });

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
    await service.setEnabled(true);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'PREFERRED' });
    expect(api.setUpTOTP).not.toHaveBeenCalled();
  });

  it('distinguishes verification mismatch from enabling an unregistered factor', async () => {
    const { api, service } = fixture();
    api.verifyTOTPSetup.mockRejectedValue({ name: 'EnableSoftwareTokenMFAException' });
    await expect(service.verifySetup('000000')).rejects.toMatchObject({ name: 'CodeMismatchException' });
    api.updateMFAPreference.mockRejectedValue({ name: 'EnableSoftwareTokenMFAException' });
    await expect(service.setEnabled(true)).rejects.toMatchObject({ name: 'EnableSoftwareTokenMFAException' });
  });

  it('disables TOTP preference without changing its association', async () => {
    const { api, service } = fixture();
    await service.setEnabled(false);
    expect(api.updateMFAPreference).toHaveBeenCalledWith({ totp: 'DISABLED' });
    expect(api.setUpTOTP).not.toHaveBeenCalled();
    expect(api.verifyTOTPSetup).not.toHaveBeenCalled();
  });

  it('allows enabling alone to be retried after preference failure', async () => {
    const { api, service } = fixture();
    await service.verifySetup('123456');
    api.updateMFAPreference.mockRejectedValueOnce(new Error('temporary failure'));
    await expect(service.setEnabled(true)).rejects.toThrow();
    await service.setEnabled(true);
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
