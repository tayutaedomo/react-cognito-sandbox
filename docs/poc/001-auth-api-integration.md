# POC 001: 認証・保護された API の連携

## 目的

React から Cognito を利用して認証し、JWT で保護した API を呼び出せるかを検証する。
ユーザー情報を Cognito 内で管理し、FastAPI の Lambda デプロイとローカルでの検証を支える仕組みも対象とする。

## 検証結果・制約

既存 README の検証記録をテーマ別に整理したものです。
現在の構成は [アーキテクチャ](../architecture.md) を参照してください。

### Cognito Managed Login (Hosted UI) を用いたフロントエンド認証

- Amplify Auth (Gen 2) を使用し、React アプリケーションから Cognito の提供するログイン画面へリダイレクトし、セキュアに JWT トークンを取得するフローを実装しました。

### API Gateway (HTTP API) + Cognito Authorizer による API 保護

- フロントエンドから送信された JWT トークンを API Gateway 側で自動検証し、有効なリクエストのみをバックエンドへ通過させる構成を Terraform で構築しました。
- 課題となりやすい CORS プリフライト（OPTIONS リクエスト）の認証回避設定も組み込み済みです。

### FastAPI を変更なしで Lambda にデプロイするコンテナアーキテクチャ

- バックエンドには Python の FastAPI を採用し、`AWS Lambda Web Adapter` を用いることで、ASGI アプリケーションを書き換えることなくコンテナイメージとしてデプロイ・実行しています。

### モックモードと実環境のシームレスな切り替え

- フロントエンド・バックエンドともに、AWS 上にデプロイしなくてもローカル単体で動作・テストが可能なモックモード（DI / Context 切替）を実装しています。

### E2E テスト (Playwright) による自動検証

- 実際の Cognito ログイン画面をヘッドレスブラウザで操作し、API からのユーザー情報取得までを通しで検証する ATDD（受け入れテスト駆動開発）を実践しました。

## 関連する設計決定

- [ADR 0001: AWS Lambda Web Adapter の採用](../adr/0001-use-aws-lambda-web-adapter-for-fastapi.md)
- [ADR 0002: Terraform State の ECR / App 分割](../adr/0002-split-terraform-state-for-ecr-and-app.md)
- [ADR 0003: CORS プリフライトの JWT Authorizer 回避](../adr/0003-bypass-options-route-for-apigw-cors.md)

## 実行手順

- [Frontend: 起動](../../frontend/README.md)
- [E2E: モック・実環境のテスト](../../e2e/README.md)
- [Backend: 起動・単体テスト](../../backend/README.md)
- [Terraform: インフラ構築](../../terraform/README.md)

[POC 一覧へ戻る](./README.md)
