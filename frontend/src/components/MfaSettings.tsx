import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { mfaErrorMessage, mfaMethods, mfaMethodLabels } from '../auth/mfaService';
import type { MfaMethod, MfaPreference, TotpSetup } from '../auth/mfaService';
import BrowserStorage from './BrowserStorage';
import MaskedData from './MaskedData';
import RegisteredDevices from './RegisteredDevices';
import ContactMfa from './ContactMfa';

export default function MfaSettings({ onBack }: { onBack: () => void }) {
  const { mfa } = useAuth();
  const [email, setEmail] = useState<{ address?: string; verified: boolean } | null>(null);
  const [phone, setPhone] = useState<{ address?: string; verified: boolean } | null>(null);
  const [preference, setPreference] = useState<MfaPreference | null>(null);
  const [setup, setSetup] = useState<(TotpSetup & { qr: string }) | null>(null);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([mfa.getPreference(), mfa.getEmail(), mfa.getPhone()])
      .then((value) => {
        if (active) {
          setPreference(value[0]);
          setEmail(value[1]);
          setPhone(value[2]);
        }
      })
      .catch((cause) => {
        if (active) setError(mfaErrorMessage(cause));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [mfa]);

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
    } catch (cause) {
      setError(mfaErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const refresh = () =>
    run(async () => {
      setPreference(null);
      setPreference(await mfa.getPreference());
      setEmail(await mfa.getEmail());
      setPhone(await mfa.getPhone());
    });

  const startSetup = () =>
    run(async () => {
      const details = await mfa.startSetup();
      const qr = await QRCode.toDataURL(details.uri, { width: 240, margin: 2 });
      setSetup({ ...details, qr });
      setCode('');
      setVerified(false);
    });

  const setTotpEnabled = (enabled: boolean) =>
    run(async () => {
      await mfa.setTotpEnabled(enabled);
      // 保存成功後に読み取りが失敗しても、古い状態で操作させない。
      setPreference(null);
      setPreference(await mfa.getPreference());
      setVerified(false);
      setMessage(
        enabled
          ? 'TOTP を有効にしました。次回の新しいログインでコードを要求します。'
          : 'TOTP を無効にしました。認証アプリの登録は保持されます。',
      );
    });

  const changeContact = (method: 'EMAIL' | 'SMS', enabled: boolean) =>
    run(async () => {
      await (method === 'EMAIL' ? mfa.setEmailEnabled(enabled) : mfa.setSmsEnabled(enabled));
      setPreference(null);
      setPreference(await mfa.getPreference());
      setMessage(`${mfaMethodLabels[method]} MFA を${enabled ? '有効' : '無効'}にしました。`);
    });

  const changePreferred = (value: string) =>
    run(async () => {
      await mfa.setPreferred(value === 'choose' ? null : (value as MfaMethod));
      setPreference(null);
      setPreference(await mfa.getPreference());
      setMessage('ログイン時の方式を保存しました。');
    });

  function verify(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await mfa.verifySetup(code);
      // 共有シークレットは検証後に画面から除去。設定保存だけ再試行できる。
      setSetup(null);
      setCode('');
      setVerified(true);
      setPreference(null);
      await mfa.setTotpEnabled(true);
      setPreference(await mfa.getPreference());
      setVerified(false);
      setMessage('認証アプリを登録し、TOTP を有効にしました。次回の新しいログインでコードを要求します。');
    });
  }

  const enabledMethods = mfaMethods.filter((method) => preference?.raw?.enabled?.includes(method));

  return (
    <main className="app-shell app-shell--narrow">
      <header className="page-heading">
        <button className="button-link" onClick={onBack} disabled={busy}>
          ホームに戻る
        </button>
        <h2>MFA 設定</h2>
        <p>認証アプリ・メール・SMS で、パスワードに加えて6桁のコードを確認します。</p>
      </header>
      {error && (
        <p className="feedback feedback--error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="feedback feedback--success" role="status">
          {message}
        </p>
      )}
      {busy && (
        <p className="feedback feedback--busy" role="status">
          処理中...
        </p>
      )}

      <section className="panel">
        <h3>TOTP 設定</h3>
        {preference && (
          <p
            className={`status-line ${preference.enabled ? 'status-line--enabled' : 'status-line--disabled'}`}
            data-testid="mfa-status"
          >
            TOTP：{preference.enabled ? '有効' : '無効'}
            {preference.preferred ? '（優先方式）' : ''}
          </p>
        )}
        {!setup && !verified && (
          <div>
            <button onClick={refresh} disabled={busy}>
              設定を再読み込み
            </button>
          </div>
        )}
        {!setup && !verified && preference && (
          <div className="action-row">
            {preference.enabled ? (
              <button
                className="button-danger"
                onClick={() => {
                  void setTotpEnabled(false);
                }}
                disabled={busy}
              >
                TOTP を無効にする
              </button>
            ) : (
              <>
                <button className="button-primary" onClick={startSetup} disabled={busy}>
                  認証アプリを登録する
                </button>
                <button
                  onClick={() => {
                    void setTotpEnabled(true);
                  }}
                  disabled={busy}
                >
                  登録済みの認証アプリを有効にする
                </button>
              </>
            )}
          </div>
        )}
        {setup && (
          <section className="subpanel">
            <h3>認証アプリを登録</h3>
            <p>Google Authenticator などの認証アプリで QR コードを読み込んでください。</p>
            <div className="qr-frame">
              <img src={setup.qr} alt="認証アプリ登録用 QR コード" width={240} height={240} />
            </div>
            <details>
              <summary>手動入力用のセットアップキー</summary>
              <code data-testid="totp-secret">{setup.secret}</code>
            </details>
            <p className="help-text">QR コードとセットアップキーは秘密情報です。共有しないでください。</p>
            <form className="form-stack" onSubmit={verify}>
              <div className="form-field form-field--compact">
                <label htmlFor="totp-setup-code">認証アプリの6桁コード</label>
                <input
                  id="totp-setup-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="form-actions">
                <button className="button-primary" type="submit" disabled={busy}>
                  コードを確認して有効にする
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setSetup(null);
                    setCode('');
                    setError('');
                  }}
                >
                  登録を中断する
                </button>
              </div>
            </form>
          </section>
        )}
        {verified && (
          <section className="subpanel">
            <p>認証アプリの登録確認は完了しました。有効化の設定をもう一度保存してください。</p>
            <button
              className="button-primary"
              onClick={() => {
                void setTotpEnabled(true);
              }}
              disabled={busy}
            >
              有効化を再試行する
            </button>
          </section>
        )}
        <div className="page-note">
          {!setup && !verified && preference && !preference.enabled && (
            <p className="help-text">
              登録済みのアプリがある場合は再び有効にできます。未登録の場合は、先に登録してください。
            </p>
          )}
          <p>変更後はサインアウトし、新しいログインで確認してください。現在のログイン状態は継続します。</p>
          <p>
            Cognito に登録済みの TOTP シークレットは取得できません。デバイスの信頼状態は下のグループで確認してください。
          </p>
        </div>
      </section>
      <ContactMfa
        method="メール"
        contactName="メールアドレス"
        contact={email}
        available={mfa.emailAvailable}
        enabled={preference?.emailEnabled}
        preferred={preference?.preferredMethod === 'EMAIL'}
        busy={busy}
        blocked={!!setup || verified}
        run={run}
        toggle={(value) => changeContact('EMAIL', value)}
        sendVerification={async () => {
          await mfa.sendEmailVerification();
          setMessage('メールアドレスの確認コードを送信しました。');
        }}
        verify={async (value) => {
          await mfa.verifyEmail(value);
          setEmail(await mfa.getEmail());
          setMessage('メールアドレスを確認しました。');
        }}
        note="メール MFA は受信先へのコード配送を使います。SES サンドボックスでは確認したアドレスだけに送信できます。送信先は Cognito の email 属性です。この画面では送信先の変更は行いません。"
      />
      <ContactMfa
        method="SMS"
        contactName="電話番号"
        contact={phone}
        available={mfa.smsAvailable}
        enabled={preference?.smsEnabled}
        preferred={preference?.preferredMethod === 'SMS'}
        busy={busy}
        blocked={!!setup || verified}
        run={run}
        toggle={(value) => changeContact('SMS', value)}
        sendVerification={async () => {
          await mfa.sendPhoneVerification();
          setMessage('電話番号の確認コードを SMS で送信しました。');
        }}
        verify={async (value) => {
          await mfa.verifyPhone(value);
          setPhone(await mfa.getPhone());
          setMessage('電話番号を確認しました。');
        }}
        note="SMS MFA は携帯電話へのコード配送を使います。SMS サンドボックスでは登録・確認した番号だけに送信できます。Cognito の電話番号確認はサンドボックスの確認と別の手続きです。未登録の場合はプロフィール編集で国際形式の電話番号を設定してください。SMS は送信ごとに課金されます。"
      />
      <section className="panel">
        <h3>ログイン時の方式</h3>
        {preference && (
          <div className="form-field">
            <label htmlFor="mfa-preferred">優先方式</label>
            <select
              id="mfa-preferred"
              disabled={busy || !!setup || verified || !enabledMethods.length}
              value={preference.preferredMethod ?? (enabledMethods.length === 1 ? enabledMethods[0] : 'choose')}
              onChange={(event) => {
                void changePreferred(event.target.value);
              }}
            >
              {enabledMethods.map((method) => (
                <option key={method} value={method}>
                  {mfaMethodLabels[method]}を優先
                </option>
              ))}
              {enabledMethods.length >= 2 && <option value="choose">ログイン時に選択</option>}
              {!enabledMethods.length && <option value="choose">MFA は無効</option>}
            </select>
          </div>
        )}
        <div className="page-note">
          <p>
            2方式以上を有効にすると「ログイン時に選択」が使えます。1方式のみの場合はその方式を使います。変更は新しいログインで確認してください。
          </p>
          <p>信頼済みデバイスの SRP ログインでは MFA 自体が省略されます。方式の変更はデバイスの信頼を解除しません。</p>
          <p>
            今回の MFA POC
            の環境では、パスワードを忘れた場合は管理者による復旧を使います。プール全体が管理者復旧設定の場合、TOTP
            ユーザーも自己復旧できません。
          </p>
        </div>
        {preference && <MaskedData label="MFA 方式の API 応答" value={preference.raw} />}
      </section>
      <RegisteredDevices />
      <BrowserStorage />
    </main>
  );
}
