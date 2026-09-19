# Backend (FastAPI)

## 概要
Python 3.13 と FastAPI を用いて構築されたバックエンド API サーバーです。
Repository パターンを用いて、ローカル開発用の「モックデータ返却機能」と、本番環境用の「Cognito Admin API (`ListUsers`) の呼び出し機能」を切り替えられる設計になっています。
AWS Lambda Web Adapter を利用した Dockerfile が用意されており、ローカルでの動作と同じコードのまま AWS Lambda 上で稼働させることが可能です。

パッケージ管理には `uv` を使用し、依存関係は `pyproject.toml` で管理されています。

## ローカル開発での実行手順

1. 環境変数の設定
   ```bash
   cp .env.example .env
   # .env の内容を確認・修正 (デフォルトでは USE_MOCK_COGNITO=1 となっており、AWS認証なしで動作します)
   ```

2. `uv` を用いて依存パッケージを同期します。
   ```bash
   uv sync
   ```

3. 開発サーバーを起動します。
   ```bash
   uv run uvicorn app.main:app --reload
   ```

## デプロイ手順

AWS へのデプロイには `scripts/deploy.sh` を使用します。（事前に `terraform/ecr` が apply されている必要があります）

```bash
./scripts/deploy.sh
```
これにより、Docker イメージのビルドと Amazon ECR への Push が行われ、既に Lambda が存在する場合はそのコードも更新されます。
