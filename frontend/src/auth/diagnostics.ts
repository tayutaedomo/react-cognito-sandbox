export interface StoredItem {
  key: string;
  value: string;
  category: string;
}

export function readStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): StoredItem[] {
  const items: StoredItem[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null) continue;
    const value = storage.getItem(key);
    if (value === null) continue;
    const category = /deviceKey|deviceGroupKey|randomPassword/i.test(key)
      ? 'デバイス'
      : /token/i.test(key)
        ? 'トークン'
        : 'その他';
    items.push({ key, value, category });
  }
  return items.sort((a, b) => a.key.localeCompare(b.key));
}

export function decodeStoredJwt(value: string): unknown {
  try {
    const parts = value.split('.');
    if (parts.length !== 3) return undefined;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

export interface AdminDevice {
  DeviceKey: string;
  DeviceAttributes?: { Name: string; Value: string }[];
  DeviceCreateDate?: string;
  DeviceLastModifiedDate?: string;
  DeviceLastAuthenticatedDate?: string;
}

export function mapAdminDevices(data: { Devices: AdminDevice[] }) {
  return data.Devices.map((device) => {
    const attributes = Object.fromEntries((device.DeviceAttributes ?? []).map((attr) => [attr.Name, attr.Value]));
    return {
      id: device.DeviceKey,
      name: attributes.device_name,
      attributes,
      createdDate: device.DeviceCreateDate ? new Date(device.DeviceCreateDate) : undefined,
      modifiedDate: device.DeviceLastModifiedDate ? new Date(device.DeviceLastModifiedDate) : undefined,
      lastAuthenticatedDate: device.DeviceLastAuthenticatedDate
        ? new Date(device.DeviceLastAuthenticatedDate)
        : undefined,
      raw: device,
    };
  });
}

export function readableDeviceName(name?: string) {
  if (!name) return '名前なしのデバイス';
  const browser = name.match(/(Google Chrome|Chromium|Firefox|Safari|Microsoft Edge)\/[\d.]+/g);
  const os = name.match(/^(macOS|Windows|Linux|Android|iOS)[^;]*?(?= (?:macOS|Chromium)|;|$)/)?.[0];
  return browser
    ? `${os ?? 'ブラウザ'} · ${browser.find((value) => value.startsWith('Google Chrome')) ?? browser[0]}`
    : name;
}

export async function fetchOwnDevices(
  endpoint: string | undefined,
  token: string | undefined,
  request: typeof fetch = fetch,
) {
  if (!endpoint || !token) throw new Error('Authenticated API configuration required');
  const response = await request(`${endpoint}/api/me/devices`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Device information unavailable');
  return mapAdminDevices(await response.json());
}

export async function mutateOwnDevice(
  endpoint: string | undefined,
  token: string | undefined,
  id: string,
  operation: 'untrust' | 'delete',
  request: typeof fetch = fetch,
) {
  if (!endpoint || !token || !id) throw new Error('Authenticated device configuration required');
  const response = await request(
    `${endpoint}/api/me/devices/${encodeURIComponent(id)}${operation === 'untrust' ? '/untrust' : ''}`,
    {
      method: operation === 'untrust' ? 'POST' : 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error('Device operation unavailable');
}

export function clearDeletedDeviceStorage(
  id: string,
  storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>,
) {
  // 削除したキーに対応する3項目だけを消す。他ユーザー・トークンは維持する。
  const prefixes = readStorage(storage)
    .filter((item) => /\.deviceKey$/.test(item.key) && item.value === id)
    .map((item) => item.key.slice(0, -'deviceKey'.length));
  for (const prefix of prefixes)
    for (const suffix of ['deviceKey', 'deviceGroupKey', 'randomPasswordKey']) storage.removeItem(prefix + suffix);
}
