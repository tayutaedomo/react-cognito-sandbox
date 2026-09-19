# 1. FastAPI の Lambda デプロイにおける AWS Lambda Web Adapter の採用

Date: 2026-09-20

## Status

Proposed

## Context

バックエンド API の実装フレームワークとして Python の FastAPI を採用した。これを AWS Lambda 上にデプロイする際、一般的には `Mangum` を用いて ASGI アプリケーションを Lambda イベントへ変換する手法が主流である。しかし、この手法では AWS 固有のインテグレーションコードがアプリケーション内に混入し、ローカル開発と本番環境との間に差異が生まれやすくなる。

## Decision

FastAPI アプリケーションに変更を加えず、そのまま Lambda コンテナイメージとして動かすため、**AWS Lambda Web Adapter** を採用する。

## Consequences

### Positive
- アプリケーションコード内に Lambda 固有のハンドラ（Mangum など）を記述する必要がなくなり、ピュアな FastAPI アプリケーションとして実装できる。
- `uv run uvicorn` を用いたローカル開発と、AWS 上での実行の差異が最小限になる。
- 将来的に Lambda 以外の環境（Fargate, App Runner 等）へ移行する際にもコードの書き換えが不要になる。

### Negative
- コンテナイメージとしてデプロイすることが必須となるため、ECR の管理と Docker build の手順がデプロイパイプラインに必要となる。
