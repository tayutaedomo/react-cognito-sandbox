import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { readableDeviceName } from '../auth/diagnostics';
import MaskedData from './MaskedData';
import { deviceTrustStatus } from '../auth/deviceService';
import type { DeviceRecord, DeviceSnapshot } from '../auth/deviceService';

const trustLabels = {
  remembered: '信頼済み',
  not_remembered: '未信頼',
  unknown: '信頼状態を取得できません',
};

export default function RegisteredDevices() {
  const { deviceAuth } = useAuth();
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [confirmation, setConfirmation] = useState<{ device: DeviceRecord; operation: 'untrust' | 'delete' } | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);

  async function refresh() {
    setBusy(true);
    setConfirmation(null);
    setMessage('');
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

  async function execute() {
    if (!confirmation || busy) return;
    setBusy(true);
    setError(false);
    setMessage('');
    try {
      if (confirmation.operation === 'untrust') await deviceAuth.untrustDevice(confirmation.device.id);
      else await deviceAuth.deleteDevice(confirmation.device.id);
      setMessage(
        confirmation.operation === 'untrust'
          ? '信頼を解除しました。デバイス登録は残ります。'
          : 'デバイス登録を削除しました。',
      );
      setConfirmation(null);
      setSnapshot(null);
      setSnapshot(await deviceAuth.snapshot());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    deviceAuth
      .snapshot()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [deviceAuth]);

  return (
    <section className="panel" aria-labelledby="registered-devices-heading">
      <h3 id="registered-devices-heading">Cognito の登録済みデバイス</h3>
      {busy && <p role="status">デバイスを読み込み中...</p>}
      {error && (
        <p className="feedback feedback--error" role="alert">
          デバイスの操作または取得を完了できませんでした。再読み込みして状態を確認してください。
        </p>
      )}
      {message && (
        <p className="feedback feedback--success" role="status">
          {message}
        </p>
      )}
      {confirmation && (
        <section className="subpanel" aria-label="デバイス操作の確認">
          <h4>{confirmation.operation === 'untrust' ? '信頼を解除しますか？' : 'デバイス登録を削除しますか？'}</h4>
          <p>対象：{readableDeviceName(confirmation.device.name)}</p>
          <p>
            {confirmation.operation === 'untrust'
              ? 'デバイス登録を残して未信頼に変更します。MFA が有効な場合、新しい SRP ログインでコードが必要になります。'
              : 'Cognito の登録を削除します。このブラウザに対応する保存情報がある場合、そのデバイス情報も削除します。新しい SRP ログインで再登録されます。'}
          </p>
          <div className="action-row">
            <button
              className="button-danger"
              disabled={busy}
              onClick={() => {
                void execute();
              }}
            >
              {confirmation.operation === 'untrust' ? '信頼解除を実行' : '登録削除を実行'}
            </button>
            <button disabled={busy} onClick={() => setConfirmation(null)}>
              キャンセル
            </button>
          </div>
        </section>
      )}
      {!busy && snapshot && (
        <>
          {snapshot.devices.length === 0 ? (
            <p data-testid="registered-devices-empty">表示できる登録済みデバイスはありません。</p>
          ) : (
            <ul className="device-list" data-testid="registered-devices-list">
              {snapshot.devices.map((device) => (
                <li key={device.id}>
                  <h4>
                    {readableDeviceName(device.name)}
                    {snapshot.currentDeviceKey === device.id && '（このブラウザ）'}
                  </h4>
                  <p
                    className={`status-line ${deviceTrustStatus(device) === 'remembered' ? 'status-line--enabled' : 'status-line--disabled'}`}
                  >
                    {trustLabels[deviceTrustStatus(device)]}
                  </p>
                  <dl className="device-dates">
                    <dt>登録日時</dt>
                    <dd>{device.createdDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                    <dt>更新日時</dt>
                    <dd>{device.modifiedDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                    <dt>最終認証</dt>
                    <dd>{device.lastAuthenticatedDate?.toLocaleString('ja-JP') ?? '取得できません'}</dd>
                  </dl>
                  <div className="action-row">
                    <button
                      disabled={busy || !!confirmation || deviceTrustStatus(device) === 'not_remembered'}
                      onClick={() => setConfirmation({ device, operation: 'untrust' })}
                    >
                      信頼を解除
                    </button>
                    <button
                      className="button-danger"
                      disabled={busy || !!confirmation}
                      onClick={() => setConfirmation({ device, operation: 'delete' })}
                    >
                      デバイス登録を削除
                    </button>
                  </div>
                  <MaskedData label="デバイスの raw データ" value={device.raw ?? device} />
                </li>
              ))}
            </ul>
          )}
          <div className="page-note">
            <p>
              登録済みデバイスと信頼済みデバイスは別です。信頼状態は Cognito の管理者 API から読み取り、MFA
              の有効・無効とは独立して表示します。SRP サインイン成功後に Amplify
              が自動登録し、「信頼する」で信頼済みに変えます。デバイス記憶に自動期限はありません。
            </p>
            <p>
              「信頼を解除」は登録を残し、「デバイス登録を削除」は登録自体を消します。現在のセッションやトークンは終了しません。MFA
              が無効の場合は、解除後もコードを要求しません。
            </p>
            {snapshot.devices.some((device) => deviceTrustStatus(device) === 'unknown') && (
              <p className="help-text">
                デバイスの登録と、次回ログインでの MFA 省略は別です。信頼状態を取得できない場合は、SRP ログインで MFA
                の要求を確認してください。
              </p>
            )}
            {!snapshot.currentDeviceKey && (
              <p className="help-text">
                このログインでは現在のブラウザを特定できません。一覧から指定したデバイスの信頼解除・登録削除はできます。新たに信頼する操作は
                SRP ログインで行ってください。
              </p>
            )}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          void refresh();
        }}
        disabled={busy}
      >
        デバイス一覧を再読み込み
      </button>
    </section>
  );
}
