# 3. HTTP API Gateway における CORS プリフライトの JWT Authorizer 回避

Date: 2026-09-20

## Status

Proposed

## Context

フロントエンドから API Gateway (HTTP API) 経由で FastAPI にリクエストを送信する際、CORS の仕様によりブラウザは事前確認（`OPTIONS` リクエスト）を行う。
今回、API Gateway 側でキャッチオールルート (`ANY /api/{proxy+}`) に対して JWT Authorizer を必須としたため、ブラウザが自動送信する認証ヘッダを持たない `OPTIONS` リクエストが Authorizer によってブロックされ（401 Unauthorized）、CORS エラーが発生した。

## Decision

API Gateway の Terraform 定義において、明示的に `OPTIONS /api/{proxy+}` というルートを追加し、これには Authorizer (認証) を設定せず Lambda へ素通し（NONE）する構成とした。

## Consequences

### Positive
- ブラウザからの Preflight (OPTIONS) リクエストがブロックされず、FastAPI 側の CORS ミドルウェアによって適切に処理される。
- 実データのリクエスト (GET, POST 等) は引き続きキャッチオールルート (`ANY`) または特定のルートで評価され、JWT 認証が厳密に守られる。

### Negative
- Terraform 上のルート定義が 1つ増える。
- FastAPI 側にも `CORSMiddleware` を設定しておく必要がある。
