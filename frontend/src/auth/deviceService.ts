export interface DeviceRecord {
  id: string;
  name?: string;
  createdDate?: Date;
  modifiedDate?: Date;
  raw?: unknown;
  lastAuthenticatedDate?: Date;
  attributes?: Record<string, string>;
}

export type DeviceTrustStatus = 'remembered' | 'not_remembered' | 'unknown';
export type CurrentDeviceStatus = DeviceTrustStatus | 'not_listed' | 'unavailable';

export interface DeviceSnapshot {
  totpEnabled: boolean;
  devices: DeviceRecord[];
  currentDeviceKey?: string;
  currentDeviceStatus: CurrentDeviceStatus;
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
  throw Object.assign(new Error('Unsupported device POC sign-in step'), {
    name: 'UnsupportedDeviceSignInStep',
  });
}

function tokenExpiration(payload?: Record<string, unknown>): Date | undefined {
  const exp = payload?.exp;
  return typeof exp === 'number' ? new Date(exp * 1000) : undefined;
}

export function deviceTrustStatus(device: DeviceRecord): DeviceTrustStatus {
  // device_status = valid や一覧への存在だけでは、記憶済み状態を判定しない。
  const status = device.attributes?.['dev:device_remembered_status'];
  return status === 'remembered' || status === 'not_remembered' ? status : 'unknown';
}

function currentDeviceStatus(key: string | undefined, devices: DeviceRecord[]): CurrentDeviceStatus {
  if (!key) return 'unavailable';
  const device = devices.find((candidate) => candidate.id === key);
  return device ? deviceTrustStatus(device) : 'not_listed';
}

export function createDeviceService(api: DeviceApi): DeviceAuthService {
  return {
    async signIn(username: string, password: string): Promise<DeviceSignInStep> {
      const result = await api.signIn({
        username,
        password,
        options: { authFlowType: 'USER_SRP_AUTH' },
      });
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
        api.fetchMFAPreference(),
        api.fetchDevices(),
        api.fetchAuthSession(),
      ]);
      const accessPayload = session.tokens?.accessToken?.payload;
      const idPayload = session.tokens?.idToken?.payload;
      const key = accessPayload?.device_key;
      const currentDeviceKey = typeof key === 'string' ? key : undefined;
      return {
        totpEnabled: preference.enabled?.includes('TOTP') ?? false,
        devices,
        currentDeviceKey,
        currentDeviceStatus: currentDeviceStatus(currentDeviceKey, devices),
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
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException')
    return 'メールアドレス、パスワード、または認証コードを確認してください。';
  if (name === 'UnsupportedDeviceSignInStep')
    return 'この POC が扱わない認証ステップです。TOTP が有効な専用ユーザーでお試しください。';
  return '端末認証を完了できませんでした。設定とサインイン状態を確認してください。';
}
