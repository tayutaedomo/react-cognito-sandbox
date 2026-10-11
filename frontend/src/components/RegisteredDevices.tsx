import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deviceTrustStatus } from '../auth/deviceService';
import type { DeviceSnapshot } from '../auth/deviceService';

const trustLabels = {
  remembered: '信頼済み',
  not_remembered: '未信頼',
  unknown: '信頼状態を取得できません',
};

export default function RegisteredDevices() {
  const { deviceAuth } = useAuth();
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  async function refresh() {
    setBusy(true);
    setError(false);
    try {
      setSnapshot(await deviceAuth.snapshot());
    } catch {
      setSnapshot(null);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    deviceAuth.snapshot().then(value => {
      if (active) setSnapshot(value);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [deviceAuth]);

  return (
    <section className="subpanel" aria-labelledby="registered-devices-heading">
      <h3 id="registered-devices-heading">登録済みデバイス</h3>
      <p className="help-text">このユーザーが Cognito に登録したデバイスを表示します。TOTP の有効・無効とは別の設定です。</p>
      {busy && <p role="status">デバイスを読み込み中...</p>}
      {error && <p className="feedback feedback--error" role="alert">デバイス一覧を取得できませんでした。時間をおいて再読み込みしてください。</p>}
      {!busy && snapshot && (
        <>
          {snapshot.devices.length === 0 ? (
            <p data-testid="registered-devices-empty">表示できる登録済みデバイスはありません。</p>
          ) : (
            <ul className="check-list" data-testid="registered-devices-list">
              {snapshot.devices.map(device => (
                <li key={device.id}>
                  <strong>{device.name || '名前なしのデバイス'}</strong>
                  {snapshot.currentDeviceKey === device.id && '（このブラウザ）'}
                  <span>：{trustLabels[deviceTrustStatus(device)]}</span>
                  {device.lastAuthenticatedDate && <span>・最終認証：{device.lastAuthenticatedDate.toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          )}
          {snapshot.devices.some(device => deviceTrustStatus(device) === 'unknown') && <p className="help-text">デバイスの登録と、次回ログインでの MFA 省略は別です。信頼状態を取得できない場合は、実験用 SRP ログインで MFA の要求を確認してください。</p>}
          {!snapshot.currentDeviceKey && <p className="help-text">このログインでは現在のブラウザを特定できません。デバイスの信頼登録・解除は実験用 SRP ログインで確認してください。</p>}
        </>
      )}
      <button type="button" onClick={() => { void refresh(); }} disabled={busy}>デバイス一覧を再読み込み</button>
    </section>
  );
}
