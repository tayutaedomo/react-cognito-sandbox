import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryAdmin } from '../helpers/mfa-recovery-admin.mjs';

const env = {
  MFA_RECOVERY_USER_EMAIL: 'mfa-recovery-unit@example.com',
  MFA_RECOVERY_USER_POOL_ID: 'ap-northeast-1_EXAMPLE',
  MFA_RECOVERY_AWS_REGION: 'ap-northeast-1',
  MFA_RECOVERY_AWS_PROFILE: 'poc',
};
const optional = { MfaConfiguration: 'OPTIONAL', SoftwareTokenMfaConfiguration: { Enabled: true } };

test('rejects other users and incomplete or mismatched environment before AWS calls', () => {
  for (const changes of [
    { MFA_RECOVERY_USER_EMAIL: 'manual@example.com' },
    { MFA_RECOVERY_USER_EMAIL: '' },
    { MFA_RECOVERY_USER_POOL_ID: 'us-east-1_OTHER' },
    { MFA_RECOVERY_AWS_REGION: '' },
    { MFA_RECOVERY_AWS_PROFILE: '' },
  ]) {
    assert.throws(() => createRecoveryAdmin({ ...env, ...changes }));
  }
});

test('refuses every mutation in OFF, ON or TOTP-disabled pools', async () => {
  for (const config of [
    { ...optional, MfaConfiguration: 'OFF' },
    { ...optional, MfaConfiguration: 'ON' },
    { ...optional, SoftwareTokenMfaConfiguration: { Enabled: false } },
  ]) {
    for (const operation of ['disable', 'globalSignOut']) {
      const calls = [];
      const admin = createRecoveryAdmin(env, async args => { calls.push(args); return config; });
      await assert.rejects(admin[operation](), /requires OPTIONAL/);
      assert.equal(calls.length, 1);
      assert.equal(calls[0][1], 'get-user-pool-mfa-config');
    }
  }
});

test('reads preference without treating inactive as unregistered', async () => {
  for (const [state, expected] of [
    [{}, false], [{ UserMFASettingList: ['SOFTWARE_TOKEN_MFA'] }, true],
  ]) {
    const calls = [];
    const admin = createRecoveryAdmin(env, async args => {
      calls.push(args);
      return args[1] === 'get-user-pool-mfa-config' ? optional : state;
    });
    assert.equal(await admin.isEnabled(), expected);
    assert.equal(calls[1][1], 'admin-get-user');
  }
});

test('targets only the configured user and disables both enabled and preferred', async () => {
  const calls = [];
  const admin = createRecoveryAdmin(env, async args => { calls.push(args); return optional; });
  await admin.disable();
  assert.deepEqual(calls[1], [
    'cognito-idp', 'admin-set-user-mfa-preference',
    '--user-pool-id', env.MFA_RECOVERY_USER_POOL_ID, '--username', env.MFA_RECOVERY_USER_EMAIL,
    '--software-token-mfa-settings', 'Enabled=false,PreferredMfa=false',
    '--region', env.MFA_RECOVERY_AWS_REGION, '--profile', env.MFA_RECOVERY_AWS_PROFILE,
    '--output', 'json', '--no-cli-pager',
  ]);
});

test('checks pool again before global sign-out and propagates failed preflight', async () => {
  const calls = [];
  const admin = createRecoveryAdmin(env, async args => { calls.push(args); return optional; });
  await admin.disable();
  await admin.globalSignOut();
  assert.equal(calls[2][1], 'get-user-pool-mfa-config');
  assert.equal(calls[3][1], 'admin-user-global-sign-out');
  const failed = createRecoveryAdmin(env, async () => { throw new Error('preflight failed'); });
  await assert.rejects(failed.disable(), /preflight failed/);
});
