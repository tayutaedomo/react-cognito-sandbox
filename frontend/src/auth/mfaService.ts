export type MfaMethod = 'TOTP' | 'EMAIL';
export type MfaSetting = 'ENABLED' | 'DISABLED' | 'PREFERRED' | 'NOT_PREFERRED';

export interface MfaPreference {
  enabled: boolean;
  preferred: boolean;
  emailEnabled: boolean;
  preferredMethod?: string;
  raw?: { enabled?: string[]; preferred?: string };
}

export interface TotpSetup {
  secret: string;
  uri: string;
}

interface MfaApi {
  fetchMFAPreference: () => Promise<{ enabled?: string[]; preferred?: string }>;
  setUpTOTP: () => Promise<{ sharedSecret: string; getSetupUri: (appName: string) => URL }>;
  verifyTOTPSetup: (input: { code: string }) => Promise<void>;
  updateMFAPreference: (input: { totp?: MfaSetting; email?: MfaSetting }) => Promise<void>;
  fetchUserAttributes: () => Promise<Record<string, string | undefined>>;
  sendUserAttributeVerificationCode: (input: { userAttributeKey: 'email' }) => Promise<unknown>;
  confirmUserAttribute: (input: { userAttributeKey: 'email'; confirmationCode: string }) => Promise<void>;
}

export interface MfaService {
  emailAvailable: boolean;
  getPreference: () => Promise<MfaPreference>;
  startSetup: () => Promise<TotpSetup>;
  verifySetup: (code: string) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setEmailEnabled: (enabled: boolean) => Promise<void>;
  setPreferred: (method: MfaMethod | null) => Promise<void>;
  getEmail: () => Promise<{ address?: string; verified: boolean }>;
  sendEmailVerification: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
}

export function createMfaService(api: MfaApi, options = { emailAvailable: true }): MfaService {
  async function toggle(method: MfaMethod, enabled: boolean) {
    if (method === 'EMAIL' && enabled) {
      if (!options.emailAvailable)
        throw Object.assign(new Error('Email MFA unavailable'), { name: 'EmailMfaUnavailable' });
      const attributes = await api.fetchUserAttributes();
      if (!attributes.email || attributes.email_verified !== 'true') {
        throw Object.assign(new Error('Verify email first'), { name: 'UnverifiedMfaEmail' });
      }
    }
    const preference = await api.fetchMFAPreference();
    const other: MfaMethod = method === 'TOTP' ? 'EMAIL' : 'TOTP';
    const otherEnabled = preference.enabled?.includes(other) ?? false;
    const input: { totp?: MfaSetting; email?: MfaSetting } = {};
    input[method === 'TOTP' ? 'totp' : 'email'] = enabled
      ? !otherEnabled || preference.preferred === method
        ? 'PREFERRED'
        : 'ENABLED'
      : 'DISABLED';
    // 残る方式が1つになった場合は、その方式を優先にする。
    if (!enabled && otherEnabled) input[other === 'TOTP' ? 'totp' : 'email'] = 'PREFERRED';
    await api.updateMFAPreference(input);
  }
  return {
    emailAvailable: options.emailAvailable,
    async getPreference() {
      const preference = await api.fetchMFAPreference();
      return {
        enabled: preference.enabled?.includes('TOTP') ?? false,
        preferred: preference.preferred === 'TOTP',
        emailEnabled: preference.enabled?.includes('EMAIL') ?? false,
        preferredMethod: preference.preferred,
        raw: preference,
      };
    },
    async startSetup() {
      const details = await api.setUpTOTP();
      return {
        secret: details.sharedSecret,
        uri: details.getSetupUri('React Cognito Sandbox').toString(),
      };
    },
    async verifySetup(code) {
      const normalized = code.trim();
      if (!/^[0-9]{6}$/.test(normalized)) {
        throw Object.assign(new Error('Invalid TOTP code'), { name: 'InvalidTotpCode' });
      }
      try {
        await api.verifyTOTPSetup({ code: normalized });
      } catch (error) {
        // VerifySoftwareToken は誤コードでこの例外を返す場合がある。
        // 有効化 API の未登録エラーとは区別する。
        if (error && typeof error === 'object' && 'name' in error && error.name === 'EnableSoftwareTokenMFAException') {
          throw Object.assign(new Error('TOTP verification failed'), {
            name: 'CodeMismatchException',
          });
        }
        throw error;
      }
    },
    async getEmail() {
      const attributes = await api.fetchUserAttributes();
      return { address: attributes.email, verified: attributes.email_verified === 'true' };
    },
    async sendEmailVerification() {
      await api.sendUserAttributeVerificationCode({ userAttributeKey: 'email' });
    },
    async verifyEmail(code) {
      if (!/^[0-9]{6}$/.test(code.trim())) throw Object.assign(new Error('Invalid code'), { name: 'InvalidTotpCode' });
      await api.confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code.trim() });
    },
    async setEmailEnabled(enabled) {
      await toggle('EMAIL', enabled);
    },
    async setPreferred(method) {
      const preference = await api.fetchMFAPreference();
      const methods = (['TOTP', 'EMAIL'] as const).filter((value) => preference.enabled?.includes(value));
      if ((method && !methods.includes(method)) || (!method && methods.length < 2)) {
        throw Object.assign(new Error('Select an enabled method'), { name: 'InvalidMfaPreference' });
      }
      const input: { totp?: MfaSetting; email?: MfaSetting } = {};
      for (const value of methods)
        input[value === 'TOTP' ? 'totp' : 'email'] = value === method ? 'PREFERRED' : 'NOT_PREFERRED';
      await api.updateMFAPreference(input);
    },
    async setEnabled(enabled) {
      await toggle('TOTP', enabled);
    },
  };
}

export function mfaErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  switch (name) {
    case 'EmailMfaUnavailable':
      return 'この環境ではメール MFA が有効ではありません。';
    case 'UnverifiedMfaEmail':
      return 'メールアドレスを確認してからメール MFA を有効にしてください。';
    case 'InvalidMfaPreference':
      return '有効な方式を選択してください。ログイン時の選択には2方式の有効化が必要です。';
    case 'ExpiredCodeException':
      return 'コードの期限が切れました。メールアドレスの確認コードを再度送信してください。';
    case 'InvalidTotpCode':
      return '半角数字6桁のコードを入力してください。';
    case 'CodeMismatchException':
      return 'コードが一致しません。入力したコードを確認してください。';
    case 'EnableSoftwareTokenMFAException':
      return '認証アプリの登録を完了してから有効にしてください。';
    case 'NotAuthorizedException':
      return '操作を完了できません。ログインし直してからお試しください。';
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return '操作が集中しています。時間を置いてお試しください。';
    default:
      return 'MFA の操作を完了できませんでした。設定を再読み込みしてからお試しください。';
  }
}
