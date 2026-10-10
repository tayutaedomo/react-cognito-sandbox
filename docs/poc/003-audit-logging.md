# POC 003: 監査ログ

## 目次

- [目的](#目的)
- [検証結果・制約](#検証結果制約)
  - [API Gateway と Lambda (FastAPI) を横断した監査ログと JSON 構造化の実装](#api-gateway-と-lambda-fastapi-を横断した監査ログと-json-構造化の実装)
- [関連する設計決定](#関連する設計決定)
- [実行手順](#実行手順)

## 目的

API Gateway と FastAPI を横断して、API を呼び出したユーザーを識別する監査ログを残せるかを検証する。
個人情報をログに出さない方針と、JSON 形式のアプリケーションログを対象とする。

## 検証結果・制約

既存 README の検証記録をテーマ別に整理したものです。
現在の構成は [アーキテクチャ](../architecture.md) を参照してください。

### API Gateway と Lambda (FastAPI) を横断した監査ログと JSON 構造化の実装

- 本番運用を見据え、API Gateway のアクセスログと FastAPI のアプリケーションログの両方で、リクエストを実行したユーザーを一意に特定するためのログ出力（監査ログ）を実装しました。
- 個人情報 (PII) 保護の観点から、`email` 等はログに出力せず、Cognito 発行の UUID である `sub` のみを記録する方針を決定しました。
- バックエンドには `AWS Lambda Powertools` を導入し、ログの JSON 構造化を実施しました。認証ミドルウェアで抽出した `sub` を `logger.append_keys` やミドルウェア経由で注入することで、Uvicorn のアクセスログや以後のすべてのビジネスロジックログに**自動的にユーザーIDが付与される**堅牢なロギング機構を構築しました。

## 関連する設計決定

- [ADR 0005: 監査ログと PII 保護方針](../adr/0005-audit-logging-strategy.md)

## 実行手順

- [Backend: 起動・単体テスト](../../backend/README.md)
- [Terraform: インフラ構築](../../terraform/README.md)

[POC 一覧へ戻る](./README.md)
