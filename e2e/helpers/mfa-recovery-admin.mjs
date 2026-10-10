import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

async function aws(args) {
  try {
    const { stdout } = await execute('aws', args, { timeout: 30_000 });
    return stdout.trim() ? JSON.parse(stdout) : {};
  } catch {
    // CLI の診断に個別環境やユーザー情報を出力しない。
    throw new Error('MFA recovery AWS operation failed; check credentials, permissions and configuration.');
  }
}

export function createRecoveryAdmin(env, run = aws) {
  const username = env.MFA_RECOVERY_USER_EMAIL;
  const pool = env.MFA_RECOVERY_USER_POOL_ID;
  const region = env.MFA_RECOVERY_AWS_REGION;
  const profile = env.MFA_RECOVERY_AWS_PROFILE;
  if (!/^mfa-recovery-[a-z0-9-]+@example\.com$/.test(username ?? '')) {
    throw new Error('Use a dedicated mfa-recovery-…@example.com test user.');
  }
  if (!region || !pool?.startsWith(`${region}_`) || !profile) {
    throw new Error('Set MFA_RECOVERY_USER_POOL_ID, MFA_RECOVERY_AWS_REGION and MFA_RECOVERY_AWS_PROFILE.');
  }
  const common = ['--region', region, '--profile', profile, '--output', 'json', '--no-cli-pager'];
  const target = ['--user-pool-id', pool, '--username', username];

  async function requireOptional() {
    const config = await run(['cognito-idp', 'get-user-pool-mfa-config', '--user-pool-id', pool, ...common]);
    if (config.MfaConfiguration !== 'OPTIONAL' || config.SoftwareTokenMfaConfiguration?.Enabled !== true) {
      throw new Error('Recovery POC requires OPTIONAL MFA with TOTP enabled.');
    }
  }

  return {
    async isEnabled() {
      await requireOptional();
      const user = await run(['cognito-idp', 'admin-get-user', ...target, ...common]);
      return user.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA') ?? false;
    },
    async disable() {
      await requireOptional();
      await run(['cognito-idp', 'admin-set-user-mfa-preference', ...target,
        '--software-token-mfa-settings', 'Enabled=false,PreferredMfa=false', ...common]);
    },
    async globalSignOut() {
      await requireOptional();
      await run(['cognito-idp', 'admin-user-global-sign-out', ...target, ...common]);
    },
  };
}
