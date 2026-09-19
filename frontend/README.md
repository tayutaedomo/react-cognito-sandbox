# Frontend (React + Vite)

## 概要
Vite と React (TypeScript) を用いて構築されたフロントエンド・アプリケーションです。
AWS Amplify SDK (今後導入予定) を利用して Cognito へのログイン・認証を行い、バックエンド API と通信します。
現在はローカル開発用の「モック認証プロバイダー（MockAuthProvider）」が組み込まれており、実際の Cognito を経由せずに UI や API の動作確認が可能です。

## 開発サーバーの起動手順

1. 依存パッケージをインストールします。
   ```bash
   npm install
   ```
2. 開発サーバーを起動します。
   ```bash
   npm run dev
   ```
3. ブラウザで `http://localhost:5173` にアクセスします。

## テストの実行 (E2E)

本プロジェクトでは Playwright を用いて、フロントエンドとバックエンドのモック連携を自動検証する E2E テストを用意しています。

```bash
npm run test:e2e
```
（実行時には自動的に Vite サーバーと FastAPI モックサーバーが起動します）
