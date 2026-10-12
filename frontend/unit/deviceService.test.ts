import { describe, expect, it, vi } from 'vitest';
import {
  createDeviceService,
  deviceErrorMessage,
  deviceTrustStatus,
  isExpiredSignInSession,
} from '../src/auth/deviceService';

function fixture() {
  const api = {
    signIn: vi.fn().mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    }),
    confirmSignIn: vi.fn().mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } }),
    fetchMFAPreference: vi.fn().mockResolvedValue({ enabled: ['TOTP'] }),
    fetchDevices: vi.fn().mockResolvedValue([
      {
        id: 'device-1',
        name: 'Browser',
        attributes: { 'dev:device_remembered_status': 'remembered' },
      },
    ]),
    fetchAuthSession: vi.fn().mockResolvedValue({
      tokens: {
        accessToken: { payload: { device_key: 'device-1', exp: 2_000_000_000 } },
        idToken: { payload: { exp: 2_000_000_100 } },
      },
    }),
    rememberDevice: vi.fn().mockResolvedValue(undefined),
    forgetDevice: vi.fn().mockResolvedValue(undefined),
  };
  return { api, service: createDeviceService(api) };
}

describe('trusted device service', () => {
  it('uses explicit USER_SRP_AUTH and surfaces the TOTP challenge', async () => {
    const { api, service } = fixture();
    expect(await service.signIn('user@example.com', 'password')).toBe('totp');
    expect(api.signIn).toHaveBeenCalledWith({
      username: 'user@example.com',
      password: 'password',
      options: { authFlowType: 'USER_SRP_AUTH' },
    });
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
    expect(snapshot).toMatchObject({
      totpEnabled: true,
      currentDeviceKey: 'device-1',
      currentDeviceStatus: 'remembered',
    });
    expect(snapshot.accessTokenExpiresAt?.toISOString()).toBe('2033-05-18T03:33:20.000Z');
    expect(snapshot.idTokenExpiresAt?.toISOString()).toBe('2033-05-18T03:35:00.000Z');
  });

  it('does not treat a registered but untrusted device as trusted', async () => {
    const { api, service } = fixture();
    api.fetchDevices.mockResolvedValue([
      { id: 'device-1', attributes: { 'dev:device_remembered_status': 'not_remembered' } },
    ]);
    expect((await service.snapshot()).currentDeviceStatus).toBe('not_remembered');
  });

  it('keeps missing status, missing device, and a login without a device key distinct', async () => {
    const { api, service } = fixture();
    api.fetchDevices.mockResolvedValue([{ id: 'device-1' }]);
    expect((await service.snapshot()).currentDeviceStatus).toBe('unknown');
    expect(deviceTrustStatus({ id: 'device-1' })).toBe('unknown');
    expect(deviceTrustStatus({ id: 'device-1', attributes: { device_status: 'valid' } })).toBe('unknown');

    api.fetchDevices.mockResolvedValue([]);
    expect((await service.snapshot()).currentDeviceStatus).toBe('not_listed');

    api.fetchAuthSession.mockResolvedValue({ tokens: { accessToken: { payload: {} } } });
    api.fetchDevices.mockResolvedValue([{ id: 'device-1', name: 'Browser' }]);
    const snapshot = await service.snapshot();
    expect(snapshot.currentDeviceStatus).toBe('unavailable');
    expect(snapshot.devices).toHaveLength(1);
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
    api.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });
    await expect(service.signIn('user@example.com', 'password')).rejects.toMatchObject({
      name: 'UnsupportedDeviceSignInStep',
    });
    expect(deviceErrorMessage({ name: 'NotAuthorizedException', message: 'password=secret' })).not.toContain('secret');
    expect(deviceErrorMessage({ name: 'UnsupportedDeviceSignInStep' })).toContain('TOTP');
  });
});

describe('email MFA challenges', () => {
  it('uses only server-provided methods and destination', async () => {
    const { api, service } = fixture();
    api.signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION', allowedMFATypes: ['SMS', 'TOTP', 'EMAIL'] },
    });
    expect(await service.signIn('user@example.com', 'password')).toEqual({
      kind: 'selection',
      methods: ['SMS', 'TOTP', 'EMAIL'],
    });
    api.confirmSignIn.mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE', codeDeliveryDetails: { destination: 'u***@e***' } },
    });
    expect(await service.selectMfa('EMAIL')).toEqual({ kind: 'email', destination: 'u***@e***' });
    expect(await service.confirmCode('012345')).toBe('signedIn');
  });
  it('rejects selection before Cognito provides options', async () => {
    const { api, service } = fixture();
    await expect(service.selectMfa('EMAIL')).rejects.toMatchObject({ name: 'InvalidMfaSelection' });
    expect(api.confirmSignIn).not.toHaveBeenCalled();
  });
  it('allows a rejected code to be retried in the same challenge', async () => {
    const { api, service } = fixture();
    api.confirmSignIn.mockRejectedValueOnce({ name: 'CodeMismatchException' });
    await expect(service.confirmCode('000000')).rejects.toMatchObject({ name: 'CodeMismatchException' });
    expect(await service.confirmCode('123456')).toBe('signedIn');
  });
});

it('restarts expired sessions without treating every wrong code as expiration', () => {
  expect(isExpiredSignInSession({ name: 'ExpiredCodeException' })).toBe(true);
  expect(isExpiredSignInSession({ name: 'NotAuthorizedException', message: 'Invalid session for the user' })).toBe(
    true,
  );
  expect(isExpiredSignInSession({ name: 'CodeMismatchException' })).toBe(false);
  expect(isExpiredSignInSession({ name: 'NotAuthorizedException', message: 'Incorrect password' })).toBe(false);
  expect(isExpiredSignInSession(null)).toBe(false);
});

it('surfaces the server-masked SMS destination and preserves retry behavior', async () => {
  const { api, service } = fixture();
  api.signIn.mockResolvedValue({
    isSignedIn: false,
    nextStep: {
      signInStep: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
      codeDeliveryDetails: { destination: '+********5678' },
    },
  });
  expect(await service.signIn('user@example.com', 'password')).toEqual({ kind: 'sms', destination: '+********5678' });
  api.confirmSignIn.mockRejectedValueOnce({ name: 'CodeMismatchException' });
  await expect(service.confirmCode('000000')).rejects.toMatchObject({ name: 'CodeMismatchException' });
  expect(await service.confirmCode('123456')).toBe('signedIn');
  api.fetchMFAPreference.mockResolvedValue({ enabled: ['SMS'] });
  expect(await service.snapshot()).toMatchObject({ smsEnabled: true, totpEnabled: false, emailEnabled: false });
});

it('rejects an SMS selection that Cognito did not offer', async () => {
  const { api, service } = fixture();
  api.signIn.mockResolvedValue({
    isSignedIn: false,
    nextStep: {
      signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION',
      allowedMFATypes: ['EMAIL', 'TOTP', 'OTHER'],
    },
  });
  await service.signIn('user@example.com', 'password');
  await expect(service.selectMfa('SMS')).rejects.toMatchObject({ name: 'InvalidMfaSelection' });
  expect(api.confirmSignIn).not.toHaveBeenCalled();
});
