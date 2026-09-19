# React + Cognito Managed Login POC

このプロジェクトは、React と AWS Cognito (Managed Login) を組み合わせたサーバーレス・アーキテクチャのプロトタイプです。ユーザー情報を DynamoDB に持たず、Cognito 内のみで管理する構成を検証することを目的としています。

## プロジェクト概要

1. **React + Cognito Managed Login の検証**
   - ユーザー登録、サインイン、パスワード変更をすべて Cognito の Managed Login (Hosted UI) で行います。
2. **API 認証の検証 (今後の実装)**
   - Cognito Authorizer + API Gateway + Lambda を用いて、Cognito Admin API (ListUsers) を呼び出す構成を検証します。

### 採用技術スタック
- **Frontend**: React (TypeScript, Vite) (※ 構築予定)
- **Backend**: AWS Lambda (コンテナベース) + API Gateway (※ 構築予定)
- **Auth**: Amazon Cognito User Pool
- **IaC**: Terraform

## ディレクトリ構成

- `terraform/`: AWSリソース (Cognito 等) をプロビジョニングするための Terraform 設定
- `frontend/`: (予定) React アプリケーション
- `backend/`: (予定) API用バックエンドアプリケーション
- `.agents/`, `AGENTS.md`: AIアシスタントとの協調開発用ルール

## 開発・実行手順
各ディレクトリの詳細な手順については、それぞれの README を参照してください。

- **[terraform/README.md](./terraform/README.md)**: IaC リソースの構成とデプロイ手順

## AI との開発ルールについて
本プロジェクトでは AI アシスタント (Antigravity) と協調して開発を行うための厳格なルール (`AGENTS.md`) を敷いています。コミットの自動実行の禁止やテスト・Lintの義務化などが定義されています。
