# Terraform (Infrastructure as Code)

このディレクトリには、プロジェクトのインフラを構築するための Terraform コードが格納されています。

## 目次

- [ディレクトリ構成](#ディレクトリ構成)
- [デプロイ手順](#デプロイ手順)
  - [1. ECR の作成](#1-ecr-の作成)
  - [2. コンテナイメージの Build & Push](#2-コンテナイメージの-build--push)
  - [3. アプリケーション本体のデプロイ](#3-アプリケーション本体のデプロイ)
- [環境変数 (direnv)](#環境変数-direnv)
- [MFA POC](#mfa-poc)
- [Amplify WAF の切り替え](#amplify-waf-の切り替え)

## ディレクトリ構成

- `ecr/`: Docker コンテナイメージを格納するための Amazon ECR リポジトリを管理します。
- `app/`: アプリケーションの本体（Cognito, Lambda, API Gateway, IAM 等）を管理します。

※ Lambda を構築する前に ECR にイメージが Push されている必要があるため、State を2つに分割しています。

## デプロイ手順

初回デプロイ時は、以下の順序で実行する必要があります。

### 1. ECR の作成
```bash
cd terraform/ecr
terraform init
terraform apply
```

### 2. コンテナイメージの Build & Push
ECR リポジトリが作成されたら、バックエンドのコンテナイメージをビルドして Push します。
```bash
cd ../../
./backend/scripts/deploy.sh
```

### 3. アプリケーション本体のデプロイ
コンテナイメージが ECR に配置されたら、Lambda や API Gateway、Cognito などの本体を構築します。
```bash
cd terraform/app
terraform init
terraform apply
```

## 環境変数 (direnv)
実行には以下の環境変数が設定されている必要があります。（ルートディレクトリの `.envrc` に記載）
- `AWS_PROFILE`
- `AWS_REGION`

## MFA POC

`app/variables.tf` の `mfa_configuration` は `OFF`（既定）・`OPTIONAL`・`ON`、`totp_enabled` は既定 `false` です。
`OPTIONAL` / `ON` では TOTP またはメールの因子が必要です。メールには SES Identity、Essentials 以上と、この POC では `admin_only` 復旧が必要です。
`OFF` は新規の TOTP 登録を設定せず、ユーザーの登録済み TOTP を削除しません。
無効化・再有効化は初回登録状態のリセットにはなりません。因子だけの無効化と MFA 方針の OFF も異なります。
繰り返し切り替える場合の制約は [MFA POC 手順](../docs/poc/005-mfa-foundation.md#無効化再有効化を繰り返す場合の制約) に記載しています。
任意 MFA の登録・設定画面は [POC 006](../docs/poc/006-optional-mfa.md) を参照してください。
メール MFA の所有確認・配送確認・適用手順は [POC 010](../docs/poc/010-email-mfa-sandbox.md) を参照してください。
任意 POC には `examples/mfa-optional.tfvars.example` を使用します。

`app/terraform.tfvars.example` は環境全体の設定テンプレート、`app/examples/mfa-*.tfvars.example` は MFA・配送・デバイス・復旧方針を切り替える設定例です。
環境固有の URL やプロジェクト名を複製せず、同じ環境で必須・任意を試すために分けています。
Terraform がこの分割を要求するわけではなく、MFA の値を `terraform.tfvars` に直接設定しても構いません。
`.example` は説明用の命名で自動読込されません。複数の `-var-file` では後に指定した値を優先します。
設定例を重ねて適用した場合は、次の plan / apply でも同じ設定例を指定するか、MFA の値を `terraform.tfvars` に反映します。
設定例を省略すると、環境ファイルに残っている MFA 方針へ戻す差分が出る場合があります。

TOTP 必須の plan は `app/` で実行します。User Pool 全体に適用されます。

```bash
terraform plan -var-file=terraform.tfvars \
  -var-file=examples/mfa-required.tfvars.example -out=mfa-required.tfplan
```

ローカル検証は、初期化済みプロバイダーと Node.js 20 以上を使用してプロジェクトルートで実行します。

```bash
terraform -chdir=terraform/app validate
node --test terraform/tests/mfa.test.mjs
```

AWS の資格情報や既存 state を使わず、User Pool 定義の plan と入力エラーを検証します。
事前確認、適用、初回登録、既存ユーザー・セッションの確認は [MFA POC 手順](../docs/poc/005-mfa-foundation.md) を参照してください。

## Amplify WAF の切り替え

`waf_enabled` は既定で `false` です。`terraform.tfvars` で `true` にすると、Amplify 用の Web ACL・関連付け・ログ設定・ロググループを作成します。
`false` に戻して適用すると、関連付けを解除し、これらの WAF リソースを削除します。WAF の保存済みログも削除されます。
Cognito の MFA・デバイス登録と Amplify の配信は維持されます。

切り替える際も、使用中の MFA 設定例を同じように指定して plan を確認してください。再有効化時は新しい Web ACL とロググループを作成します。
