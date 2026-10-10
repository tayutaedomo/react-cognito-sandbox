export interface DeviceRecord {
  id: string;
  name?: string;
  lastAuthenticatedDate?: Date;
  attributes?: Record<string, string>;
}

export interface DeviceSnapshot {
  totpEnabled: boolean;
  devices: DeviceRecord[];
  currentDeviceKey?: string;
  currentDeviceRemembered: boolean;
  accessTokenExpiresAt?: Date;
  idTokenExpiresAt?: Date;
}

export interface DeviceAuthService {
  signIn(username: string, password: string): Promise<DeviceSignInStep>;
  confirmTotp(code: string): Promise<DeviceSignInStep>;
  snapshot(): Promise<DeviceSnapshot>;
  rememberCurrentDevice(): Promise<void>;
  forgetCurrentDevice(): Promise<void>;
}

interface SignInResult {
  isSignedIn: boolean;
  nextStep: { signInStep: string };
}

interface DeviceApi {
  signIn: (input: {
    username: string;
    password: string;
    options: { authFlowType: 'USER_SRP_AUTH' };
  }) => Promise<SignInResult>;
  confirmSignIn: (input: { challengeResponse: string }) => Promise<SignInResult>;
  fetchMFAPreference: () => Promise<{ enabled?: string[] }>;
  fetchDevices: () => Promise<DeviceRecord[]>;
  fetchAuthSession: () => Promise<{
    tokens?: {
      accessToken?: { payload: Record<string, unknown> };
      idToken?: { payload: Record<string, unknown> };
    };
  }>;
  rememberDevice: () => Promise<void>;
  forgetDevice: () => Promise<void>;
}

export type DeviceSignInStep = 'signedIn' | 'totp';

function mapSignInResult(result: SignInResult): DeviceSignInStep {
  if (result.isSignedIn) return 'signedIn';
  if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp';
  throw Object.assign(new Error('Unsupported device POC sign-in step'), { name: 'UnsupportedDeviceSignInStep' });
}

function tokenExpiration(payload?: Record<string, unknown>): Date | undefined {
  const exp = payload?.exp;
  return typeof exp === 'number' ? new Date(exp * 1000) : undefined;
}

export function createDeviceService(api: DeviceApi): DeviceAuthService {
  return {
    async signIn(username: string, password: string): Promise<DeviceSignInStep> {
      const result = await api.signIn({ username, password, options: { authFlowType: 'USER_SRP_AUTH' } });
      return mapSignInResult(result);
    },
    async confirmTotp(code: string): Promise<DeviceSignInStep> {
      if (!/^[0-9]{6}$/.test(code)) {
        throw Object.assign(new Error('Invalid TOTP code'), { name: 'InvalidTotpCode' });
      }
      return mapSignInResult(await api.confirmSignIn({ challengeResponse: code }));
    },
    async snapshot(): Promise<DeviceSnapshot> {
      const [preference, devices, session] = await Promise.all([
        api.fetchMFAPreference(), api.fetchDevices(), api.fetchAuthSession(),
      ]);
      const accessPayload = session.tokens?.accessToken?.payload;
      const idPayload = session.tokens?.idToken?.payload;
      const key = accessPayload?.device_key;
      const currentDeviceKey = typeof key === 'string' ? key : undefined;
      return {
        totpEnabled: preference.enabled?.includes('TOTP') ?? false,
        devices,
        currentDeviceKey,
        currentDeviceRemembered: Boolean(currentDeviceKey && devices.some(device => device.id === currentDeviceKey)),
        accessTokenExpiresAt: tokenExpiration(accessPayload),
        idTokenExpiresAt: tokenExpiration(idPayload),
      };
    },
    async rememberCurrentDevice(): Promise<void> {
      await api.rememberDevice();
    },
    async forgetCurrentDevice(): Promise<void> {
      await api.forgetDevice();
    },
  };
}

export function deviceErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  if (name === 'InvalidTotpCode') return '半角数字6桁のコードを入力してください。';
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException') return 'メールアドレス、パスワード、または認証コードを確認してください。';
  if (name === 'UnsupportedDeviceSignInStep') return 'この POC が扱わない認証ステップです。TOTP が有効な専用ユーザーでお試しください。';
  return '端末認証を完了できませんでした。設定とサインイン状態を確認してください。';
}
