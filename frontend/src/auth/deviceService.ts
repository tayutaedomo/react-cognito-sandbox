import type { MfaMethod } from './mfaService';
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
  emailEnabled: boolean;
  smsEnabled: boolean;
  devices: DeviceRecord[];
  currentDeviceKey?: string;
  currentDeviceStatus: CurrentDeviceStatus;
  accessTokenExpiresAt?: Date;
  idTokenExpiresAt?: Date;
}

export interface DeviceAuthService {
  signIn(username: string, password: string): Promise<DeviceSignInStep>;
  confirmTotp(code: string): Promise<DeviceSignInStep>;
  confirmCode(code: string): Promise<DeviceSignInStep>;
  selectMfa(method: MfaMethod): Promise<DeviceSignInStep>;
  snapshot(): Promise<DeviceSnapshot>;
  rememberCurrentDevice(): Promise<void>;
  untrustDevice(id: string): Promise<void>;
  deleteDevice(id: string): Promise<void>;
  forgetCurrentDevice(): Promise<void>;
}

interface SignInResult {
  isSignedIn: boolean;
  nextStep: { signInStep: string; allowedMFATypes?: string[]; codeDeliveryDetails?: { destination?: string } };
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
  untrustDevice: (id: string) => Promise<void>;
  deleteDevice: (id: string) => Promise<void>;
}

export type DeviceSignInStep =
  | 'signedIn'
  | 'totp'
  | { kind: 'email'; destination?: string }
  | { kind: 'sms'; destination?: string }
  | { kind: 'selection'; methods: MfaMethod[] };

function mapSignInResult(result: SignInResult): DeviceSignInStep {
  if (result.isSignedIn) return 'signedIn';
  if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') return 'totp';
  if (['CONFIRM_SIGN_IN_WITH_EMAIL_CODE', 'CONFIRM_SIGN_IN_WITH_SMS_CODE'].includes(result.nextStep.signInStep)) {
    return {
      kind: result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE' ? 'sms' : 'email',
      destination: result.nextStep.codeDeliveryDetails?.destination,
    };
  }
  if (result.nextStep.signInStep === 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION') {
    const methods = (result.nextStep.allowedMFATypes ?? []).filter(
      (value): value is MfaMethod => value === 'TOTP' || value === 'EMAIL' || value === 'SMS',
    );
    if (methods.length) return { kind: 'selection', methods };
  }
  throw Object.assign(new Error('Unsupported sign-in step'), {
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
  let allowedMethods: MfaMethod[] = [];
  function map(result: SignInResult) {
    const step = mapSignInResult(result);
    allowedMethods = typeof step === 'object' && step.kind === 'selection' ? step.methods : [];
    return step;
  }
  async function confirmCode(code: string) {
    if (!/^[0-9]{6}$/.test(code)) throw Object.assign(new Error('Invalid code'), { name: 'InvalidTotpCode' });
    return map(await api.confirmSignIn({ challengeResponse: code }));
  }
  return {
    async signIn(username: string, password: string): Promise<DeviceSignInStep> {
      allowedMethods = [];
      const result = await api.signIn({
        username,
        password,
        options: { authFlowType: 'USER_SRP_AUTH' },
      });
      return map(result);
    },
    confirmTotp: confirmCode,
    confirmCode,
    async selectMfa(method) {
      if (!allowedMethods.includes(method))
        throw Object.assign(new Error('Unavailable MFA'), { name: 'InvalidMfaSelection' });
      return map(await api.confirmSignIn({ challengeResponse: method }));
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
        emailEnabled: preference.enabled?.includes('EMAIL') ?? false,
        smsEnabled: preference.enabled?.includes('SMS') ?? false,
        devices,
        currentDeviceKey,
        currentDeviceStatus: currentDeviceStatus(currentDeviceKey, devices),
        accessTokenExpiresAt: tokenExpiration(accessPayload),
        idTokenExpiresAt: tokenExpiration(idPayload),
      };
    },
    async untrustDevice(id) {
      if (!(await api.fetchDevices()).some((device) => device.id === id)) throw new Error('Device unavailable');
      await api.untrustDevice(id);
    },
    async deleteDevice(id) {
      if (!(await api.fetchDevices()).some((device) => device.id === id)) throw new Error('Device unavailable');
      await api.deleteDevice(id);
    },
    async rememberCurrentDevice(): Promise<void> {
      await api.rememberDevice();
    },
    async forgetCurrentDevice(): Promise<void> {
      await api.forgetDevice();
    },
  };
}

export function isExpiredSignInSession(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? error.name : undefined;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return name === 'ExpiredCodeException' || (name === 'NotAuthorizedException' && /session/i.test(message));
}

export function deviceErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  if (name === 'InvalidTotpCode') return '半角数字6桁のコードを入力してください。';
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException')
    return 'メールアドレス、パスワード、または認証コードを確認してください。';
  if (name === 'CodeMismatchException') return 'コードが一致しません。入力したコードを確認してください。';
  if (name === 'ExpiredCodeException') return 'コードの期限が切れました。ログインからやり直してください。';
  if (name === 'InvalidMfaSelection') return '表示されている MFA 方式から選択してください。';
  if (name === 'UnsupportedDeviceSignInStep')
    return 'この画面が扱わない認証ステップです。TOTP・メール・SMS MFA の設定を確認してください。';
  return '端末認証を完了できませんでした。設定とサインイン状態を確認してください。';
}
