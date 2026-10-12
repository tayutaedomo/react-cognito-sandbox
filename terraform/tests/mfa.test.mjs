import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

// 実際の User Pool 定義だけを空の state で plan する。AWS 認証・接続は不要。
// アプリ全体の data sources、既存 state、tfvars は読み込まない。
const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'cognito-mfa-test-'));
after(() => rmSync(fixture, { recursive: true, force: true }));
const source = readFileSync(join(appDir, 'main.tf'), 'utf8');
const pool = source.match(/^resource "aws_cognito_user_pool" "main" \{[\s\S]*?^\}/m)?.[0];
assert.ok(pool, 'User Pool resource must exist');
const smsResources = [
  ...source.matchAll(/^resource "(?:aws_iam_role|aws_iam_role_policy|random_uuid)" "cognito_sms" \{[\s\S]*?^\}/gm),
]
  .map((match) => match[0])
  .join('\n')
  .replaceAll('data.aws_caller_identity.current.account_id', '"123456789012"');
copyFileSync(join(appDir, 'variables.tf'), join(fixture, 'variables.tf'));
copyFileSync(join(appDir, '.terraform.lock.hcl'), join(fixture, '.terraform.lock.hcl'));
symlinkSync(join(appDir, '.terraform'), join(fixture, '.terraform'), 'dir');
writeFileSync(
  join(fixture, 'main.tf'),
  `
terraform {
  required_providers {
    random = {
      source = "hashicorp/random"
      version = "~> 3.0"
    }
    aws = {
      source = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
provider "aws" {
  region = "ap-northeast-1"
  access_key = "offline-test"
  secret_key = "offline-test"
  skip_credentials_validation = true
  skip_metadata_api_check = true
  skip_region_validation = true
  skip_requesting_account_id = true
}
${pool}
${smsResources}
`,
);

function terraform(args) {
  const result = spawnSync('terraform', [`-chdir=${fixture}`, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      // AWS_PROFILE や TF_VAR_* 等、利用者の実環境の設定を引き継がない。
      PATH: process.env.PATH,
      HOME: fixture,
      AWS_EC2_METADATA_DISABLED: 'true',
      TF_IN_AUTOMATION: '1',
    },
  });
  assert.ifError(result.error);
  return result;
}

function plan(vars = {}) {
  return terraform([
    'plan',
    '-input=false',
    '-refresh=false',
    '-lock=false',
    '-no-color',
    '-out=plan.tfplan',
    '-var=project_name=mfa-offline-test',
    '-var=callback_urls=[]',
    '-var=logout_urls=[]',
    ...Object.entries(vars).map(([key, value]) => `-var=${key}=${value}`),
  ]);
}

for (const [name, vars, expectedMode, expectedTotp] of [
  ['defaults preserve MFA OFF', {}, 'OFF', false],
  ['OFF ignores the TOTP registration toggle', { mfa_configuration: 'OFF', totp_enabled: true }, 'OFF', false],
  ['OPTIONAL enables TOTP', { mfa_configuration: 'OPTIONAL', totp_enabled: true }, 'OPTIONAL', true],
  ['ON requires TOTP', { mfa_configuration: 'ON', totp_enabled: true }, 'ON', true],
]) {
  test(name, () => {
    const result = plan(vars);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const shown = terraform(['show', '-json', 'plan.tfplan']);
    assert.equal(shown.status, 0, shown.stderr);
    const values = JSON.parse(shown.stdout).planned_values.root_module.resources[0].values;
    assert.equal(values.mfa_configuration, expectedMode);
    assert.equal(values.software_token_mfa_configuration?.[0]?.enabled === true, expectedTotp);
    assert.deepEqual(values.account_recovery_setting[0].recovery_mechanism, [{ name: 'verified_email', priority: 1 }]);
  });
}

for (const mode of ['OPTIONAL', 'ON']) {
  test(`${mode} without a factor is rejected`, () => {
    const result = plan({ mfa_configuration: mode, totp_enabled: false });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Enable totp_enabled/);
  });
}

for (const mode of ['REQUIRED', 'on', '']) {
  test(`invalid MFA mode ${JSON.stringify(mode)} is rejected`, () => {
    const result = plan({ mfa_configuration: mode });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /mfa_configuration must be OFF, OPTIONAL, or ON/);
  });
}

const emailVars = {
  mfa_configuration: 'OPTIONAL',
  totp_enabled: true,
  email_mfa_enabled: true,
  user_pool_tier: 'ESSENTIALS',
  account_recovery_mode: 'admin_only',
  ses_email_identity_arn: 'arn:aws:ses:ap-northeast-1:123456789012:identity/test@example.com',
};
test('email MFA requires SES and admin-only recovery while keeping TOTP', () => {
  const result = plan(emailVars);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const shown = terraform(['show', '-json', 'plan.tfplan']);
  const values = JSON.parse(shown.stdout).planned_values.root_module.resources[0].values;
  assert.equal(values.email_configuration[0].email_sending_account, 'DEVELOPER');
  assert.match(values.email_mfa_configuration[0].message, /\{####\}/);
  assert.equal(values.software_token_mfa_configuration[0].enabled, true);
  assert.equal(values.account_recovery_setting[0].recovery_mechanism[0].name, 'admin_only');
});
for (const [key, value] of [
  ['account_recovery_mode', 'verified_email'],
  ['user_pool_tier', 'LITE'],
  ['mfa_configuration', 'OFF'],
]) {
  test(`email MFA rejects incompatible ${key}`, () => {
    const result = plan({ ...emailVars, [key]: value });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /Email MFA requires/);
  });
}
test('email MFA rejects missing SES identity', () => {
  const { ses_email_identity_arn: _arn, ...vars } = emailVars;
  const result = plan(vars);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Email MFA requires/);
});

test('SES and admin-only recovery can be applied before email MFA', () => {
  const result = plan({ ...emailVars, email_mfa_enabled: false });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const shown = terraform(['show', '-json', 'plan.tfplan']);
  const values = JSON.parse(shown.stdout).planned_values.root_module.resources[0].values;
  assert.equal(values.email_configuration[0].email_sending_account, 'DEVELOPER');
  assert.equal(values.account_recovery_setting[0].recovery_mechanism[0].name, 'admin_only');
  assert.equal(values.email_mfa_configuration.length, 0);
  assert.equal(values.software_token_mfa_configuration[0].enabled, true);
});

const smsVars = { ...emailVars, sms_mfa_enabled: true };
test('SMS adds a Tokyo SNS configuration without removing email, TOTP or recovery', () => {
  const result = plan(smsVars);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const shown = terraform(['show', '-json', 'plan.tfplan']);
  const resources = JSON.parse(shown.stdout).planned_values.root_module.resources;
  const pool = resources.find((resource) => resource.type === 'aws_cognito_user_pool').values;
  assert.equal(pool.sms_configuration[0].sns_region, 'ap-northeast-1');
  assert.match(pool.sms_authentication_message, /\{####\}/);
  assert.equal(pool.email_mfa_configuration.length, 1);
  assert.equal(pool.software_token_mfa_configuration[0].enabled, true);
  assert.equal(pool.account_recovery_setting[0].recovery_mechanism[0].name, 'admin_only');
  assert.equal(resources.filter((resource) => resource.name === 'cognito_sms').length, 3);
  const policy = JSON.parse(resources.find((resource) => resource.type === 'aws_iam_role_policy').values.policy);
  assert.deepEqual(policy.Statement, [{ Action: 'sns:Publish', Effect: 'Allow', Resource: '*' }]);
});
for (const [key, value] of [
  ['mfa_configuration', 'OFF'],
  ['account_recovery_mode', 'verified_email'],
]) {
  test(`SMS rejects incompatible ${key}`, () => {
    const result = plan({
      mfa_configuration: 'OPTIONAL',
      account_recovery_mode: 'admin_only',
      sms_mfa_enabled: true,
      [key]: value,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr + result.stdout, /SMS MFA requires/);
  });
}
test('SMS alone is a valid factor for OPTIONAL MFA', () => {
  const result = plan({ mfa_configuration: 'OPTIONAL', sms_mfa_enabled: true, account_recovery_mode: 'admin_only' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
test('SMS resources are absent by default', () => {
  const result = plan();
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const shown = terraform(['show', '-json', 'plan.tfplan']);
  const resources = JSON.parse(shown.stdout).planned_values.root_module.resources;
  assert.equal(
    resources.some((resource) => resource.name === 'cognito_sms'),
    false,
  );
  assert.equal(
    (resources.find((resource) => resource.type === 'aws_cognito_user_pool').values.sms_configuration ?? []).length,
    0,
  );
});
