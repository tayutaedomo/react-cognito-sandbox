import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

// WAF 定義を空の state で plan し、作成対象の切り替えを AWS 非接続で確認する。
// アプリ全体の data sources、既存 state、tfvars は読み込まない。
const appDir = fileURLToPath(new URL('../app/', import.meta.url));
const fixture = mkdtempSync(join(tmpdir(), 'amplify-waf-test-'));
after(() => rmSync(fixture, { recursive: true, force: true }));
const source = readFileSync(join(appDir, 'main.tf'), 'utf8');
const waf = [
  ...source.matchAll(
    /^resource "(?:aws_cloudwatch_log_group|aws_wafv2_[^"]+)" "(?:waf_amplify|amplify)" \{[\s\S]*?^\}/gm,
  ),
]
  .map((match) => match[0])
  .join('\n');
assert.ok(waf, 'WAF resources must exist');
copyFileSync(join(appDir, 'variables.tf'), join(fixture, 'variables.tf'));
copyFileSync(join(appDir, '.terraform.lock.hcl'), join(fixture, '.terraform.lock.hcl'));
symlinkSync(join(appDir, '.terraform'), join(fixture, '.terraform'), 'dir');
writeFileSync(
  join(fixture, 'main.tf'),
  `
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
provider "aws" {
  alias = "us_east_1"
  region = "us-east-1"
  access_key = "offline-test"
  secret_key = "offline-test"
  skip_credentials_validation = true
  skip_metadata_api_check = true
  skip_region_validation = true
  skip_requesting_account_id = true
}
resource "aws_amplify_app" "frontend" { name = "offline-test" }
${waf}
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

for (const [name, vars, expectedCount] of [
  ['WAF is disabled by default', {}, 0],
  ['WAF can be enabled with its logging and association', { waf_enabled: true }, 4],
  ['WAF can be explicitly disabled', { waf_enabled: false }, 0],
]) {
  test(name, () => {
    const result = plan(vars);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const shown = terraform(['show', '-json', 'plan.tfplan']);
    assert.equal(shown.status, 0, shown.stderr);
    const resources = JSON.parse(shown.stdout).planned_values.root_module.resources;
    const wafResources = resources.filter((resource) => resource.type !== 'aws_amplify_app');
    assert.equal(wafResources.length, expectedCount);
    if (expectedCount) {
      assert.deepEqual(wafResources.map((resource) => resource.type).sort(), [
        'aws_cloudwatch_log_group',
        'aws_wafv2_web_acl',
        'aws_wafv2_web_acl_association',
        'aws_wafv2_web_acl_logging_configuration',
      ]);
    }
  });
}
