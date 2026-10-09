# React + Cognito Managed Login POC

このプロジェクトは、React と AWS Cognito (Managed Login) を組み合わせたサーバーレス・アーキテクチャのプロトタイプ（POC）です。
ユーザー情報を DynamoDB に持たず、Cognito 内のみで管理し、セキュアな API 連携までを一気通貫で検証した構成となっています。

## 採用技術スタック

- **Frontend**: React, TypeScript, Vite, AWS Amplify, Playwright
- **Backend**: Python, FastAPI, AWS Lambda Web Adapter, boto3, Pytest
- **Auth**: Amazon Cognito User Pool
- **IaC**: Terraform (App / ECR 分割管理)

## ドキュメント

- [アーキテクチャ](./docs/architecture.md): 現在の構成図、認証・API・配信・ログの経路
- [POC 一覧](./docs/poc/README.md): 認証・API 連携、画面・属性の制約、監査ログ、配信・WAF の検証結果
- [ADR](./docs/adr/): 重要なアーキテクチャ設計決定とその理由

## ディレクトリ構成

- `frontend/`: React アプリケーションと Playwright E2E テスト。ローカル/実環境の切り替え対応。
- `backend/`: FastAPI アプリケーション、単体テスト、コンテナビルド用 Dockerfile。
- `terraform/`: AWS リソースの構成ファイル（`app/` と `ecr/` に分割）。
- `docs/`: アーキテクチャ、POC の記録、ADR。
- `AGENTS.md`: AI アシスタントとの協調開発用ルール定義。

## 開発・実行手順

各コンポーネントの README に、起動方法やテスト・デプロイ手順を記載しています。
初回の AWS デプロイは Terraform の README に記載した順序で進めてください。

1. [Terraform](./terraform/README.md): IaC リソースの構成とデプロイ手順
2. [Frontend](./frontend/README.md): React アプリの開発手順と E2E テスト実行方法
3. [Backend](./backend/README.md): FastAPI の起動方法、単体テスト・Lint・デプロイ手順

## AI との開発ルールについて

AI エージェントとの開発ルールは [AGENTS.md](./AGENTS.md) を参照してください。
`.agents/` のフックは Antigravity 用で、Codex ではそのまま利用できません。
