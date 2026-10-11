import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { readableDeviceName } from '../auth/diagnostics';
import MaskedData from './MaskedData';
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
    setSnapshot(null);
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
    <section className="panel" aria-labelledby="registered-devices-heading">
      <h3 id="registered-devices-heading">Cognito の登録済みデバイス</h3>
      {busy && <p role="status">デバイスを読み込み中...</p>}
      {error && <p className="feedback feedback--error" role="alert">デバイス一覧を取得できませんでした。時間をおいて再読み込みしてください。</p>}
      {!busy && snapshot && (
        <>
          {snapshot.devices.length === 0 ? (
            <p data-testid="registered-devices-empty">表示できる登録済みデバイスはありません。</p>
          ) : (
            <ul className="device-list" data-testid="registered-devices-list">
              {snapshot.devices.map(device => (
                <li key={device.id}>
                  <h4>{readableDeviceName(device.name)}{snapshot.currentDeviceKey === device.id && '（このブラウザ）'}</h4>
                  <p className={`status-line ${deviceTrustStatus(device) === 'remembered' ? 'status-line--enabled' : 'status-line--disabled'}`}>{trustLabels[deviceTrustStatus(device)]}</p>
                  <dl className="device-dates">
                    <dt>登録日時</dt><dd>{device.createdDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                    <dt>更新日時</dt><dd>{device.modifiedDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                    <dt>最終認証</dt><dd>{device.lastAuthenticatedDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                  </dl>
                  <MaskedData label="デバイスの raw データ" value={device.raw ?? device} />
                </li>
              ))}
            </ul>
          )}
          <div className="page-note">
          <p>登録済みデバイスと信頼済みデバイスは別です。信頼状態は Cognito の管理者 API から読み取り、TOTP の設定とは独立して表示します。デバイス記憶に自動期限はありません。</p>
          {snapshot.devices.some(device => deviceTrustStatus(device) === 'unknown') && <p className="help-text">デバイスの登録と、次回ログインでの MFA 省略は別です。信頼状態を取得できない場合は、SRP ログインで MFA の要求を確認してください。</p>}
          {!snapshot.currentDeviceKey && <p className="help-text">このログインでは現在のブラウザを特定できません。デバイスの信頼登録・解除はSRP ログインで確認してください。</p>}
          </div>
        </>
      )}
      <button type="button" onClick={() => { void refresh(); }} disabled={busy}>デバイス一覧を再読み込み</button>
    </section>
  );
}
