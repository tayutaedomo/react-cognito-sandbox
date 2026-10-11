import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function emailSandboxConfig(env) {
  const from = env.MFA_EMAIL_FROM?.trim();
  const to = env.MFA_EMAIL_TO?.trim();
  if (!from || !to || from === to || ![from, to].every((value) => /^[^\s@]+@gmail\.com$/i.test(value))) {
    throw new Error('Set distinct Gmail addresses in MFA_EMAIL_FROM and MFA_EMAIL_TO.');
  }
  return { from, to };
}

// アドレス・パスワード・AWS の詳細エラーをログやコマンド引数に出さない。
export function awsRequest(service, operation, input, runner = spawnSync) {
  const directory = mkdtempSync(join(tmpdir(), 'email-mfa-input-'));
  const path = join(directory, 'input.json');
  let result;
  try {
    writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
    result = runner(
      'aws',
      [
        service,
        operation,
        '--profile',
        'tayutae',
        '--region',
        'ap-northeast-1',
        '--cli-input-json',
        `file://${path}`,
        '--output',
        'json',
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, AWS_PAGER: '' },
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  if (result.error || result.status !== 0)
    throw new Error(`AWS operation failed: ${service}/${operation}. Check SSO and permissions.`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

export async function prepareIdentities(config, request = awsRequest) {
  const result = [];
  for (const [label, address] of [
    ['sender', config.from],
    ['recipient', config.to],
  ]) {
    const identities = request('sesv2', 'list-email-identities', {}).EmailIdentities ?? [];
    const existing = identities.find((identity) => identity.IdentityName === address);
    if (!existing) request('sesv2', 'create-email-identity', { EmailIdentity: address });
    result.push({ label, verified: existing?.SendingEnabled === true, verificationRequested: !existing });
  }
  return result;
}

export function requireVerified(config, request = awsRequest) {
  const account = request('sesv2', 'get-account', {});
  if (account.ProductionAccessEnabled || !account.SendingEnabled)
    throw new Error('This POC requires an enabled SES sandbox.');
  for (const address of [config.from, config.to]) {
    if (request('sesv2', 'get-email-identity', { EmailIdentity: address }).VerifiedForSendingStatus !== true) {
      throw new Error('Complete both SES identity verification links first.');
    }
  }
}

export function deliveryRequest(config) {
  return {
    FromEmailAddress: config.from,
    Destination: { ToAddresses: [config.to] },
    Content: {
      Simple: {
        Subject: { Data: 'メール MFA POC：配送確認', Charset: 'UTF-8' },
        Body: { Text: { Data: 'SES サンドボックスからの配送確認です。認証コードは含みません。', Charset: 'UTF-8' } },
      },
    },
  };
}
