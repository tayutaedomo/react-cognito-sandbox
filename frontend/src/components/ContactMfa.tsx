import { useState } from 'react';

interface Props {
  method: 'メール' | 'SMS';
  contactName: 'メールアドレス' | '電話番号';
  contact: { address?: string; verified: boolean } | null;
  available: boolean;
  enabled?: boolean;
  preferred: boolean;
  busy: boolean;
  blocked: boolean;
  run: (operation: () => Promise<void>) => Promise<void>;
  toggle: (enabled: boolean) => Promise<void>;
  sendVerification: () => Promise<void>;
  verify: (code: string) => Promise<void>;
  note: string;
}

export default function ContactMfa(props: Props) {
  const { method, contactName, contact, enabled, available, preferred, busy, blocked, run } = props;
  const [verificationSent, setVerificationSent] = useState(false);
  const [code, setCode] = useState('');
  const id = method === 'SMS' ? 'phone-verify-code' : 'email-verify-code';
  return (
    <section className="panel">
      <h3>{method} MFA</h3>
      {!available && <p>この環境では{method} MFA は利用できません。配送の設定後に有効になります。</p>}
      <p>
        送信先：{contact?.address ?? '未登録または取得できません'}（{contact?.verified ? '確認済み' : '未確認'}）
      </p>
      {enabled !== undefined && (
        <p className="status-line" data-testid={method === 'SMS' ? 'sms-mfa-status' : 'email-mfa-status'}>
          {method}：{enabled ? '有効' : '無効'}
          {preferred ? '（優先方式）' : ''}
        </p>
      )}
      <div className="action-row">
        {enabled !== undefined && (
          <button
            disabled={busy || blocked || (!enabled && (!available || !contact?.verified))}
            onClick={() => {
              void props.toggle(!enabled);
            }}
          >
            {method} MFA を{enabled ? '無効' : '有効'}にする
          </button>
        )}
        {available && contact?.address && !contact.verified && (
          <button
            disabled={busy || blocked}
            onClick={() => {
              void run(async () => {
                await props.sendVerification();
                setVerificationSent(true);
              });
            }}
          >
            {contactName}の確認コードを送信
          </button>
        )}
      </div>
      {verificationSent && !contact?.verified && (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await props.verify(code);
              setCode('');
              setVerificationSent(false);
            });
          }}
        >
          <div className="form-field form-field--compact">
            <label htmlFor={id}>{contactName}の確認コード</label>
            <input
              id={id}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={busy || blocked}
            />
          </div>
          <button disabled={busy || blocked}>{contactName}を確認する</button>
        </form>
      )}
      <div className="page-note">
        <p>{props.note}</p>
      </div>
    </section>
  );
}
