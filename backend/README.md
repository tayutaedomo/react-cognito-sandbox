# Backend (FastAPI)

## 概要
Python 3.13 と FastAPI を用いて構築されたバックエンド API サーバーです。
現在はローカル開発用のモック API (`/api/users`) が実装されています。今後のフェーズで実際の Cognito Admin API (`ListUsers`) を呼び出す実装に変更されます。
AWS Lambda Web Adapter を利用した Dockerfile が用意されており、ローカルでの動作と同じコードのまま AWS Lambda 上で稼働させることが可能です。

パッケージ管理には `uv` を使用し、依存関係は `pyproject.toml` および `uv.lock` で管理されています。

## ローカル開発での実行手順

1. `uv` を用いて依存パッケージを同期します。
   ```bash
   uv sync
   ```
2. 開発サーバーを起動します。
   ```bash
   uv run uvicorn app.main:app --reload
   ```
3. `http://localhost:8000/api/health` や `http://localhost:8000/api/users` (認証ヘッダーが必要) にアクセスして動作を確認します。
