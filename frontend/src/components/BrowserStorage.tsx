import { useState } from 'react';
import { decodeStoredJwt, readStorage, readableDeviceName } from '../auth/diagnostics';
import { useAuth } from '../auth/AuthContext';
import { deviceTrustStatus } from '../auth/deviceService';
import type { DeviceRecord } from '../auth/deviceService';
import MaskedData from './MaskedData';

export default function BrowserStorage() {
  const { deviceAuth } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [comparisonBusy, setComparisonBusy] = useState(false);
  const [comparisonError, setComparisonError] = useState(false);
  const [items, setItems] = useState<ReturnType<typeof readStorage>>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = async () => {
    setRevision((value) => value + 1);
    setDevices([]);
    setComparisonError(false);
    setComparisonBusy(true);
    try {
      setItems(readStorage(window.localStorage));
      setError(false);
      setLoaded(true);
    } catch {
      setItems([]);
      setError(true);
      setComparisonBusy(false);
      return;
    }
    try {
      setDevices((await deviceAuth.snapshot()).devices);
    } catch {
      setComparisonError(true);
    } finally {
      setComparisonBusy(false);
    }
  };
  return (
    <section className="panel" aria-labelledby="browser-storage-heading">
      <h3 id="browser-storage-heading">このブラウザの保存情報</h3>
      <button
        type="button"
        disabled={comparisonBusy}
        onClick={() => {
          void refresh();
        }}
      >
        localStorage を読み込む
      </button>
      {error && <p role="alert">ブラウザの保存情報を読み取れませんでした。</p>}
      {loaded && !error && (
        <div key={revision}>
          {items.length === 0 && <p>保存された項目はありません。</p>}
          {['デバイス', 'トークン', 'その他'].map((category) => (
            <section className="subpanel" key={category}>
              <h4>
                {category}（{items.filter((item) => item.category === category).length}件）
              </h4>
              {items
                .filter((item) => item.category === category)
                .map((item) => (
                  <div className="storage-item" key={item.key}>
                    {/deviceKey$/i.test(item.key) && (
                      <p>
                        {comparisonBusy
                          ? 'Cognito と照合中...'
                          : comparisonError
                            ? 'Cognito との照合に失敗しました。'
                            : (() => {
                                const matching = devices.find((device) => device.id === item.value);
                                return matching
                                  ? `Cognito の対応デバイス：${readableDeviceName(matching.name)}（${deviceTrustStatus(matching) === 'remembered' ? '信頼済み' : deviceTrustStatus(matching) === 'not_remembered' ? '未信頼' : '信頼状態不明'}）`
                                  : '取得した Cognito の一覧に対応するデバイスはありません。';
                              })()}
                      </p>
                    )}
                    <MaskedData label={item.key} value={item.value} />
                    {decodeStoredJwt(item.value) !== undefined && (
                      <MaskedData label="JWT のペイロード（署名未検証）" value={decodeStoredJwt(item.value)} />
                    )}
                  </div>
                ))}
            </section>
          ))}
        </div>
      )}
      <div className="page-note">
        <p>
          現在のサイトの localStorage をすべて表示します。他サイト・別ブラウザ・Cognito
          内部の保存情報は含みません。再読み込み時は値を再びマスクします。
        </p>
        <p>
          デバイスキー・グループキー・デバイス認証用の秘密情報は、このブラウザを識別・認証するための情報です。信頼済みかどうかは
          Cognito の状態と照合してください。
        </p>
        <p>
          トークンなどの値は初期状態でマスクしています。JWT
          のデコードは内容の表示であり、有効性の検証ではありません。表示した値は共有しないでください。
        </p>
      </div>
    </section>
  );
}
