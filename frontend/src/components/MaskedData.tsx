import { useState } from 'react';

export default function MaskedData({ label, value }: { label: string; value: unknown }) {
  const [visible, setVisible] = useState(false);
  return <details onToggle={event => { if (!event.currentTarget.open) setVisible(false); }}>
    <summary>{label}</summary>
    <button type="button" onClick={() => setVisible(!visible)}>{visible ? '値を隠す' : 'マスクを解除して表示'}</button>
    <pre className="raw-data">{visible ? JSON.stringify(value, null, 2) : '••••••••（マスク中）'}</pre>
  </details>;
}
