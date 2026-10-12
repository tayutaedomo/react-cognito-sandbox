export type MfaMethod = 'TOTP' | 'EMAIL' | 'SMS';
export type MfaSetting = 'ENABLED' | 'DISABLED' | 'PREFERRED' | 'NOT_PREFERRED';

export interface MfaPreference {
  enabled: boolean;
  preferred: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
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
  updateMFAPreference: (input: { totp?: MfaSetting; email?: MfaSetting; sms?: MfaSetting }) => Promise<void>;
  fetchUserAttributes: () => Promise<Record<string, string | undefined>>;
  sendUserAttributeVerificationCode: (input: { userAttributeKey: 'email' | 'phone_number' }) => Promise<unknown>;
  confirmUserAttribute: (input: {
    userAttributeKey: 'email' | 'phone_number';
    confirmationCode: string;
  }) => Promise<void>;
}

export interface MfaService {
  emailAvailable: boolean;
  smsAvailable: boolean;
  getPreference: () => Promise<MfaPreference>;
  startSetup: () => Promise<TotpSetup>;
  verifySetup: (code: string) => Promise<void>;
  setTotpEnabled: (enabled: boolean) => Promise<void>;
  setSmsEnabled: (enabled: boolean) => Promise<void>;
  getPhone: () => Promise<{ address?: string; verified: boolean }>;
  sendPhoneVerification: () => Promise<void>;
  verifyPhone: (code: string) => Promise<void>;
  setEmailEnabled: (enabled: boolean) => Promise<void>;
  setPreferred: (method: MfaMethod | null) => Promise<void>;
  getEmail: () => Promise<{ address?: string; verified: boolean }>;
  sendEmailVerification: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
}

const methodKeys = { TOTP: 'totp', EMAIL: 'email', SMS: 'sms' } as const;
export const mfaMethods: MfaMethod[] = ['TOTP', 'EMAIL', 'SMS'];
export const mfaMethodLabels: Record<MfaMethod, string> = { TOTP: '認証アプリ', EMAIL: 'メール', SMS: 'SMS' };

export function createMfaService(
  api: MfaApi,
  options: { emailAvailable: boolean; smsAvailable?: boolean } = { emailAvailable: true, smsAvailable: true },
): MfaService {
  async function toggle(method: MfaMethod, enabled: boolean) {
    if (method !== 'TOTP' && enabled) {
      const isEmail = method === 'EMAIL';
      if (!(isEmail ? options.emailAvailable : options.smsAvailable === true))
        throw Object.assign(new Error('MFA unavailable'), {
          name: isEmail ? 'EmailMfaUnavailable' : 'SmsMfaUnavailable',
        });
      const attributes = await api.fetchUserAttributes();
      const key = isEmail ? 'email' : 'phone_number';
      if (!attributes[key] || attributes[`${key}_verified`] !== 'true') {
        throw Object.assign(new Error('Verify contact first'), {
          name: isEmail ? 'UnverifiedMfaEmail' : 'UnverifiedMfaPhone',
        });
      }
    }
    const preference = await api.fetchMFAPreference();
    const remaining = mfaMethods.filter((value) => value !== method && preference.enabled?.includes(value));
    const input: { totp?: MfaSetting; email?: MfaSetting; sms?: MfaSetting } = {};
    input[methodKeys[method]] = enabled
      ? !remaining.length || preference.preferred === method
        ? 'PREFERRED'
        : 'ENABLED'
      : 'DISABLED';
    if (!enabled && remaining.length === 1) input[methodKeys[remaining[0]]] = 'PREFERRED';
    // 優先していた方式を外し、2方式以上が残る場合はユーザーに選んでもらう。
    if (!enabled && remaining.length > 1 && preference.preferred === method)
      for (const value of remaining) input[methodKeys[value]] = 'NOT_PREFERRED';
    await api.updateMFAPreference(input);
  }
  return {
    emailAvailable: options.emailAvailable,
    smsAvailable: options.smsAvailable === true,
    async getPreference() {
      const preference = await api.fetchMFAPreference();
      return {
        enabled: preference.enabled?.includes('TOTP') ?? false,
        preferred: preference.preferred === 'TOTP',
        emailEnabled: preference.enabled?.includes('EMAIL') ?? false,
        smsEnabled: preference.enabled?.includes('SMS') ?? false,
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
    async getPhone() {
      const attributes = await api.fetchUserAttributes();
      return { address: attributes.phone_number, verified: attributes.phone_number_verified === 'true' };
    },
    async sendPhoneVerification() {
      await api.sendUserAttributeVerificationCode({ userAttributeKey: 'phone_number' });
    },
    async verifyPhone(code) {
      if (!/^[0-9]{6}$/.test(code.trim())) throw Object.assign(new Error('Invalid code'), { name: 'InvalidTotpCode' });
      await api.confirmUserAttribute({ userAttributeKey: 'phone_number', confirmationCode: code.trim() });
    },
    async setSmsEnabled(enabled) {
      await toggle('SMS', enabled);
    },
    async setEmailEnabled(enabled) {
      await toggle('EMAIL', enabled);
    },
    async setPreferred(method) {
      const preference = await api.fetchMFAPreference();
      const methods = mfaMethods.filter((value) => preference.enabled?.includes(value));
      if ((method && !methods.includes(method)) || (!method && methods.length < 2)) {
        throw Object.assign(new Error('Select an enabled method'), { name: 'InvalidMfaPreference' });
      }
      const input: { totp?: MfaSetting; email?: MfaSetting; sms?: MfaSetting } = {};
      for (const value of methods) input[methodKeys[value]] = value === method ? 'PREFERRED' : 'NOT_PREFERRED';
      await api.updateMFAPreference(input);
    },
    async setTotpEnabled(enabled) {
      await toggle('TOTP', enabled);
    },
  };
}

export function mfaErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  switch (name) {
    case 'SmsMfaUnavailable':
      return 'この環境では SMS MFA が有効ではありません。';
    case 'UnverifiedMfaPhone':
      return '電話番号を確認してから SMS MFA を有効にしてください。';
    case 'EmailMfaUnavailable':
      return 'この環境ではメール MFA が有効ではありません。';
    case 'UnverifiedMfaEmail':
      return 'メールアドレスを確認してからメール MFA を有効にしてください。';
    case 'InvalidMfaPreference':
      return '有効な方式を選択してください。ログイン時の選択には2方式の有効化が必要です。';
    case 'ExpiredCodeException':
      return 'コードの期限が切れました。連絡先の確認コードを再度送信してください。';
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
