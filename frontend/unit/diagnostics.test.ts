import { expect, it, vi } from 'vitest';
import {
  decodeStoredJwt,
  mutateOwnDevice,
  clearDeletedDeviceStorage,
  fetchOwnDevices,
  mapAdminDevices,
  readStorage,
  readableDeviceName,
} from '../src/auth/diagnostics';
import { deviceTrustStatus } from '../src/auth/deviceService';

it('reads all storage including empty values and classifies device credentials', () => {
  const values: Record<string, string> = {
    deviceKey: 'device',
    randomPassword: 'secret',
    idToken: 'jwt',
    misc: '',
  };
  const storage = {
    length: 4,
    key: (index: number) => Object.keys(values)[index],
    getItem: (key: string) => values[key],
  };
  const result = readStorage(storage);
  expect(result).toHaveLength(4);
  expect(result.find((item) => item.key === 'randomPassword')?.category).toBe('デバイス');
  expect(result.find((item) => item.key === 'idToken')?.category).toBe('トークン');
  expect(result.find((item) => item.key === 'misc')?.value).toBe('');
});

it('preserves admin raw fields and explicit trust status with dates', () => {
  const raw = {
    DeviceKey: 'key',
    DeviceCreateDate: '2026-10-11T00:00:00Z',
    DeviceAttributes: [
      { Name: 'dev:device_remembered_status', Value: 'remembered' },
      { Name: 'extra', Value: 'value' },
    ],
  };
  const [device] = mapAdminDevices({ Devices: [raw] });
  expect(device.raw).toEqual(raw);
  expect(deviceTrustStatus(device)).toBe('remembered');
  expect(device.createdDate?.toISOString()).toBe('2026-10-11T00:00:00.000Z');
  expect(mapAdminDevices({ Devices: [] })).toEqual([]);
});

it('decodes JWT content without treating opaque refresh tokens as JWT', () => {
  expect(decodeStoredJwt('header.' + btoa(JSON.stringify({ sub: 'self', exp: 123 })) + '.signature')).toEqual({
    sub: 'self',
    exp: 123,
  });
  expect(decodeStoredJwt('opaque')).toBeUndefined();
  expect(decodeStoredJwt('a.invalid.c')).toBeUndefined();
});

it('summarizes long browser names without replacing the preserved raw data', () => {
  expect(readableDeviceName('macOS 26.5.2 arm macOS Chromium/154.0.8037.98;Google Chrome/154.0.8037.98')).toBe(
    'macOS 26.5.2 arm · Google Chrome/154.0.8037.98',
  );
  expect(readableDeviceName('Custom device')).toBe('Custom device');
});

it('requests only the authenticated self endpoint and fails without configuration', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Devices: [] }) });
  await expect(fetchOwnDevices(undefined, 'token', request)).rejects.toThrow();
  await expect(fetchOwnDevices('https://api', undefined, request)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  expect(await fetchOwnDevices('https://api', 'token', request)).toEqual([]);
  expect(request).toHaveBeenCalledWith('https://api/api/me/devices', {
    headers: { Authorization: 'Bearer token' },
    cache: 'no-store',
  });
  request.mockResolvedValue({ ok: false });
  await expect(fetchOwnDevices('https://api', 'token', request)).rejects.toThrow('Device information unavailable');
});

it('uses separate self-only operations and never includes a user name', async () => {
  const request = vi.fn().mockResolvedValue({ ok: true });
  await mutateOwnDevice('https://api.example.com', 'token', 'device/1', 'untrust', request);
  expect(request).toHaveBeenLastCalledWith('https://api.example.com/api/me/devices/device%2F1/untrust', {
    method: 'POST',
    headers: { Authorization: 'Bearer token' },
    cache: 'no-store',
  });
  await mutateOwnDevice('https://api.example.com', 'token', 'device-1', 'delete', request);
  expect(request.mock.calls[1][1].method).toBe('DELETE');
  request.mockResolvedValue({ ok: false });
  await expect(mutateOwnDevice('https://api.example.com', 'token', 'device-1', 'delete', request)).rejects.toThrow(
    'Device operation unavailable',
  );
});

it('clears only storage associated with the deleted device and leaves other users and tokens intact', () => {
  const data = new Map([
    ['userA.deviceKey', 'deleted'],
    ['userA.deviceGroupKey', 'group'],
    ['userA.randomPasswordKey', 'secret'],
    ['userA.idToken', 'token'],
    ['userB.deviceKey', 'other'],
    ['userB.randomPasswordKey', 'other-secret'],
  ]);
  const storage = {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  clearDeletedDeviceStorage('deleted', storage);
  expect([...data.keys()]).toEqual(['userA.idToken', 'userB.deviceKey', 'userB.randomPasswordKey']);
});
