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
今回の因子は TOTP のみで、`OPTIONAL` / `ON` では `totp_enabled = true` が必要です。
`OFF` は新規の TOTP 登録を設定せず、ユーザーの登録済み TOTP を削除しません。
無効化・再有効化は初回登録状態のリセットにはなりません。因子だけの無効化と MFA 方針の OFF も異なります。
繰り返し切り替える場合の制約は [MFA POC 手順](../docs/poc/005-mfa-foundation.md#無効化再有効化を繰り返す場合の制約) に記載しています。
任意 MFA の登録・設定画面は [POC 006](../docs/poc/006-optional-mfa.md) を参照してください。
任意 POC には `examples/mfa-optional.tfvars.example` を使用します。

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
