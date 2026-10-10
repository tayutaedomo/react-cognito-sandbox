export interface MfaPreference {
  enabled: boolean;
  preferred: boolean;
}

export interface TotpSetup {
  secret: string;
  uri: string;
}

interface MfaApi {
  fetchMFAPreference: () => Promise<{ enabled?: string[]; preferred?: string }>;
  setUpTOTP: () => Promise<{ sharedSecret: string; getSetupUri: (appName: string) => URL }>;
  verifyTOTPSetup: (input: { code: string }) => Promise<void>;
  updateMFAPreference: (input: { totp: 'PREFERRED' | 'DISABLED' }) => Promise<void>;
}

export interface MfaService {
  getPreference: () => Promise<MfaPreference>;
  startSetup: () => Promise<TotpSetup>;
  verifySetup: (code: string) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
}

export function createMfaService(api: MfaApi): MfaService {
  return {
    async getPreference() {
      const preference = await api.fetchMFAPreference();
      return {
        enabled: preference.enabled?.includes('TOTP') ?? false,
        preferred: preference.preferred === 'TOTP',
      };
    },
    async startSetup() {
      const details = await api.setUpTOTP();
      return { secret: details.sharedSecret, uri: details.getSetupUri('React Cognito Sandbox').toString() };
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
          throw Object.assign(new Error('TOTP verification failed'), { name: 'CodeMismatchException' });
        }
        throw error;
      }
    },
    async setEnabled(enabled) {
      await api.updateMFAPreference({ totp: enabled ? 'PREFERRED' : 'DISABLED' });
    },
  };
}

export function mfaErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  switch (name) {
    case 'InvalidTotpCode':
      return '半角数字6桁のコードを入力してください。';
    case 'CodeMismatchException':
      return 'コードが一致しません。認証アプリの現在のコードを確認してください。';
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
