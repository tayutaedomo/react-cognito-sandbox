import { describe, expect, it, vi } from 'vitest';
import { createDeviceService, deviceErrorMessage } from '../src/auth/deviceService';

function fixture() {
  const api = {
    signIn: vi.fn().mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' } }),
    confirmSignIn: vi.fn().mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } }),
    fetchMFAPreference: vi.fn().mockResolvedValue({ enabled: ['TOTP'] }),
    fetchDevices: vi.fn().mockResolvedValue([{ id: 'device-1', name: 'Browser' }]),
    fetchAuthSession: vi.fn().mockResolvedValue({ tokens: {
      accessToken: { payload: { device_key: 'device-1', exp: 2_000_000_000 } },
      idToken: { payload: { exp: 2_000_000_100 } },
    } }),
    rememberDevice: vi.fn().mockResolvedValue(undefined),
    forgetDevice: vi.fn().mockResolvedValue(undefined),
  };
  return { api, service: createDeviceService(api) };
}

describe('trusted device service', () => {
  it('uses explicit USER_SRP_AUTH and surfaces the TOTP challenge', async () => {
    const { api, service } = fixture();
    expect(await service.signIn('user@example.com', 'password')).toBe('totp');
    expect(api.signIn).toHaveBeenCalledWith({ username: 'user@example.com', password: 'password', options: { authFlowType: 'USER_SRP_AUTH' } });
  });

  it('validates six ASCII digits before confirming TOTP', async () => {
    const { api, service } = fixture();
    for (const code of ['', '12345', '1234567', '12a456', '１２３４５６']) {
      await expect(service.confirmTotp(code)).rejects.toMatchObject({ name: 'InvalidTotpCode' });
    }
    expect(api.confirmSignIn).not.toHaveBeenCalled();
    expect(await service.confirmTotp('012345')).toBe('signedIn');
    expect(api.confirmSignIn).toHaveBeenCalledWith({ challengeResponse: '012345' });
  });

  it('separates remembered device status from token expiration', async () => {
    const { service } = fixture();
    const snapshot = await service.snapshot();
    expect(snapshot).toMatchObject({ totpEnabled: true, currentDeviceKey: 'device-1', currentDeviceRemembered: true });
    expect(snapshot.accessTokenExpiresAt?.toISOString()).toBe('2033-05-18T03:33:20.000Z');
    expect(snapshot.idTokenExpiresAt?.toISOString()).toBe('2033-05-18T03:35:00.000Z');
  });

  it('delegates current-device remember and forget operations', async () => {
    const { api, service } = fixture();
    await service.rememberCurrentDevice();
    await service.forgetCurrentDevice();
    expect(api.rememberDevice).toHaveBeenCalledOnce();
    expect(api.forgetDevice).toHaveBeenCalledOnce();
  });

  it('rejects unsupported challenges without exposing provider errors', async () => {
    const { api, service } = fixture();
    api.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' } });
    await expect(service.signIn('user@example.com', 'password')).rejects.toMatchObject({ name: 'UnsupportedDeviceSignInStep' });
    expect(deviceErrorMessage({ name: 'NotAuthorizedException', message: 'password=secret' })).not.toContain('secret');
    expect(deviceErrorMessage({ name: 'UnsupportedDeviceSignInStep' })).toContain('TOTP');
  });
});
