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
copyFileSync(join(appDir, 'variables.tf'), join(fixture, 'variables.tf'));
copyFileSync(join(appDir, '.terraform.lock.hcl'), join(fixture, '.terraform.lock.hcl'));
symlinkSync(join(appDir, '.terraform'), join(fixture, '.terraform'), 'dir');
writeFileSync(join(fixture, 'main.tf'), `
terraform {
  required_providers {
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
`);

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
    'plan', '-input=false', '-refresh=false', '-lock=false', '-no-color', '-out=plan.tfplan',
    '-var=project_name=mfa-offline-test', '-var=callback_urls=[]', '-var=logout_urls=[]',
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
    assert.deepEqual(values.account_recovery_setting[0].recovery_mechanism, [
      { name: 'verified_email', priority: 1 },
    ]);
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
