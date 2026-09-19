# Terraform (IaC)

## 1. 概要 (Overview)
AWS 上に認証基盤やアプリケーション基盤（API Gateway, Lambda 等）を構築するための Terraform コード群です。
現在（フェーズ1）は、Cognito User Pool および Managed Login のインフラ構築を行っています。

---

## 2. ディレクトリ構成 (Directory Structure)

```text
terraform/
├── README.md
├── main.tf          # プロバイダー設定、Cognito User Pool 等のリソース定義
└── outputs.tf       # apply 実行後に出力される変数の定義 (フロントエンド等で利用)
```

**リソース分割方針:**
現在は小規模な POC であるため、プロバイダ設定や Cognito 関連リソースをすべて `main.tf` に統合し、セクション（コメントブロック）で分割して管理しています。今後の拡張に伴い、必要に応じてモジュール化やファイル分割を行います。

---

## 3. 構築される主要リソース

- **AWS Cognito User Pool**: ユーザー情報を管理するプール。
- **AWS Cognito User Pool Client**: React アプリ（フロントエンド）から OAuth (Authorization Code Flow) でアクセスするためのクライアント設定。コールバックは `http://localhost:5173` に設定されています。
- **AWS Cognito User Pool Domain**: Managed Login (Hosted UI) を提供するための専用ドメイン（ランダム文字列を利用）。

---

## 4. デプロイ（環境構築）の実行手順

本プロジェクトでは `direnv` を利用して AWS プロファイルやリージョン情報等の環境変数を読み込んでいます。実行前に `.env` ファイルに `AWS_PROFILE` などを設定してください。

### Step 1: 初期化
```bash
cd terraform
terraform init
```

### Step 2: 適用 (デプロイ)
```bash
terraform apply
```

### Step 3: 出力値の確認
適用完了後に出力される `cognito_domain_url` や `cognito_user_pool_client_id` の値は、フロントエンド (React) の Amplify または OAuth クライアント設定に使用します。
```bash
terraform output
```
