import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../auth/AuthContext';
import { mfaErrorMessage } from '../auth/mfaService';
import type { MfaPreference, TotpSetup } from '../auth/mfaService';

export default function MfaSettings({ onBack }: { onBack: () => void }) {
  const { mfa } = useAuth();
  const [preference, setPreference] = useState<MfaPreference | null>(null);
  const [setup, setSetup] = useState<(TotpSetup & { qr: string }) | null>(null);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    mfa.getPreference().then(value => {
      if (active) setPreference(value);
    }).catch(cause => {
      if (active) setError(mfaErrorMessage(cause));
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
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

  const refresh = () => run(async () => {
    setPreference(null);
    setPreference(await mfa.getPreference());
  });

  const startSetup = () => run(async () => {
    const details = await mfa.startSetup();
    const qr = await QRCode.toDataURL(details.uri, { width: 240, margin: 2 });
    setSetup({ ...details, qr });
    setCode('');
    setVerified(false);
  });

  const setEnabled = (enabled: boolean) => run(async () => {
    await mfa.setEnabled(enabled);
    // 保存成功後に読み取りが失敗しても、古い状態で操作させない。
    setPreference(null);
    setPreference(await mfa.getPreference());
    setVerified(false);
    setMessage(enabled ? 'TOTP を有効にしました。次回の新しいログインでコードを要求します。' : 'TOTP を無効にしました。認証アプリの登録は保持されます。');
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
      await mfa.setEnabled(true);
      setPreference(await mfa.getPreference());
      setVerified(false);
      setMessage('認証アプリを登録し、TOTP を有効にしました。次回の新しいログインでコードを要求します。');
    });
  }

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
      <h2>MFA 設定</h2>
      <button onClick={onBack} disabled={busy}>ホームに戻る</button>
      <p>認証アプリを使うと、パスワードに加えて6桁のコードでログインできます。</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {busy && <p role="status">処理中...</p>}
      {preference && <p data-testid="mfa-status">TOTP：{preference.enabled ? '有効' : '無効'}{preference.preferred ? '（優先方式）' : ''}</p>}
      {!setup && !verified && <button onClick={refresh} disabled={busy}>設定を再読み込み</button>}
      {!setup && !verified && preference && (
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {preference.enabled ? (
            <button onClick={() => { void setEnabled(false); }} disabled={busy}>TOTP を無効にする</button>
          ) : (
            <>
              <button onClick={startSetup} disabled={busy}>認証アプリを登録する</button>
              <button onClick={() => { void setEnabled(true); }} disabled={busy}>登録済みの認証アプリを有効にする</button>
            </>
          )}
        </div>
      )}
      {!setup && !verified && preference && !preference.enabled && <p>登録済みのアプリがある場合は再び有効にできます。未登録の場合は、先に登録してください。</p>}
      {setup && (
        <section>
          <h3>認証アプリを登録</h3>
          <p>Google Authenticator などの認証アプリで QR コードを読み込んでください。</p>
          <img src={setup.qr} alt="認証アプリ登録用 QR コード" width={240} height={240} />
          <details>
            <summary>手動入力用のセットアップキー</summary>
            <code data-testid="totp-secret">{setup.secret}</code>
          </details>
          <p>QR コードとセットアップキーは秘密情報です。共有しないでください。</p>
          <form onSubmit={verify}>
            <label htmlFor="totp-setup-code">認証アプリの6桁コード</label>
            <input id="totp-setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
            <button type="submit" disabled={busy}>コードを確認して有効にする</button>
          </form>
          <button disabled={busy} onClick={() => { setSetup(null); setCode(''); setError(''); }}>登録を中断する</button>
        </section>
      )}
      {verified && (
        <section>
          <p>認証アプリの登録確認は完了しました。有効化の設定をもう一度保存してください。</p>
          <button onClick={() => { void setEnabled(true); }} disabled={busy}>有効化を再試行する</button>
        </section>
      )}
      <p>変更後はサインアウトし、新しいログインで確認してください。現在のログイン状態は継続します。</p>
    </div>
  );
}
