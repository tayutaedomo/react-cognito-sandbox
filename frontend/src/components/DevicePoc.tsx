import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deviceErrorMessage } from '../auth/deviceService';
import type { DeviceSnapshot } from '../auth/deviceService';

function formatDate(value?: Date) {
  return value ? value.toLocaleString() : '取得できません';
}

export default function DevicePoc({ onBack }: { onBack: () => void }) {
  const { deviceAuth, refreshUser, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'credentials' | 'totp' | 'devices'>('credentials');
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadSnapshot() {
    const value = await deviceAuth.snapshot();
    setSnapshot(value);
  }

  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try { await operation(); }
    catch (cause) { setError(deviceErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  function submitCredentials(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await deviceAuth.signIn(email, password);
      if (result === 'totp') setStep('totp');
      else {
        await refreshUser();
        await loadSnapshot();
        setStep('devices');
      }
    });
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await deviceAuth.confirmTotp(code);
      if (result === 'totp') throw new Error('Repeated TOTP challenge');
      await refreshUser();
      await loadSnapshot();
      setPassword('');
      setCode('');
      setStep('devices');
    });
  }

  const remember = () => run(async () => {
    await deviceAuth.rememberCurrentDevice();
    await loadSnapshot();
    setMessage('このブラウザを信頼するデバイスとして登録しました。');
  });

  const forget = () => run(async () => {
    await deviceAuth.forgetCurrentDevice();
    await loadSnapshot();
    setMessage('このデバイスの信頼を解除しました。次回は MFA が要求されます。');
  });

  const leave = () => run(async () => { await signOut(); setSnapshot(null); setStep('credentials'); onBack(); });

  return <main className="app-shell app-shell--narrow">
    <header className="page-heading">
      <button className="button-link" onClick={onBack} disabled={busy}>ホームに戻る</button>
      <h2>信頼するデバイス POC</h2>
      <p>この実験用ログインは Cognito User Pools の SRP 認証を使います。通常の Hosted UI はそのまま利用できます。</p>
    </header>
    <section className="panel">
      {error && <p className="feedback feedback--error" role="alert">{error}</p>}
      {message && <p className="feedback feedback--success" role="status">{message}</p>}
      {busy && <p className="feedback feedback--busy" role="status">処理中...</p>}
      {step === 'credentials' && <form className="form-stack" onSubmit={submitCredentials}>
        <h3>専用ユーザーでログイン</h3>
        <div className="form-field">
          <label htmlFor="device-email">メールアドレス</label>
          <input id="device-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
        </div>
        <div className="form-field">
          <label htmlFor="device-password">パスワード</label>
          <input id="device-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        </div>
        <div className="form-actions"><button className="button-primary" type="submit" disabled={busy}>SRP でログイン</button></div>
      </form>}
      {step === 'totp' && <form className="form-stack" onSubmit={submitCode}>
        <h3>TOTP を入力</h3>
        <div className="form-field form-field--compact">
          <label htmlFor="device-totp">認証アプリの6桁コード</label>
          <input id="device-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
        </div>
        <div className="form-actions"><button className="button-primary" type="submit" disabled={busy}>確認</button></div>
      </form>}
      {step === 'devices' && snapshot && <section>
        <h3>現在の認証状態</h3>
        <div className="metric-grid">
          <p className="metric" data-testid="device-totp-status">TOTP：{snapshot.totpEnabled ? '有効' : '無効'}</p>
          <p className={`metric${snapshot.currentDeviceRemembered ? ' metric--positive' : ''}`} data-testid="device-remembered-status">この端末：{snapshot.currentDeviceRemembered ? '信頼済み' : '未登録'}</p>
          <p className="metric">デバイス信頼の期限：Cognito に自動期限なし</p>
          <p className="metric">アクセストークン期限：{formatDate(snapshot.accessTokenExpiresAt)}</p>
          <p className="metric">ID トークン期限：{formatDate(snapshot.idTokenExpiresAt)}</p>
          <p className="metric">リフレッシュトークンの有効期間：User Pool Client の設定値（このトークン自体に JWT の `exp` はありません）</p>
          <p className="metric">登録済みデバイス数：{snapshot.devices.length}</p>
        </div>
        <div className="action-row">
          {snapshot.currentDeviceRemembered
            ? <button className="button-danger" onClick={() => { void forget(); }} disabled={busy}>この端末の信頼を解除</button>
            : <button className="button-primary" onClick={() => { void remember(); }} disabled={busy}>このブラウザを信頼する</button>}
          <button onClick={() => { void run(loadSnapshot); }} disabled={busy}>状態を再読み込み</button>
          <button onClick={() => { void leave(); }} disabled={busy}>サインアウト</button>
        </div>
        <section className="subpanel">
          <h3>確認ポイント</h3>
          <ul className="check-list">
            <li>信頼登録後、同じブラウザで再ログインすると MFA が省略されるか</li>
            <li>別ブラウザでは MFA が要求されるか</li>
            <li>信頼解除後、同じブラウザで MFA が再要求されるか</li>
            <li>トークン期限とデバイスの信頼状態が独立しているか</li>
          </ul>
          <p className="help-text">Cognito のデバイス記憶に自動期限はありません。期限付きで信頼を解除する運用はアプリ側の設計対象です。</p>
        </section>
      </section>}
    </section>
  </main>;
}
