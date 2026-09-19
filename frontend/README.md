# Frontend (React + Vite)

## 概要
Vite と React (TypeScript) で構築されたフロントエンドアプリケーションです。
AWS Amplify Auth (Gen 2) を利用して Cognito と連携し、ログイン・サインアウトおよび JWT トークンの取得を行います。

ローカル開発をスムーズに行うため、環境変数によって「モックモード」と「実 Cognito 環境モード」を切り替えられるように設計されています。

## 環境構築と起動

1. 依存パッケージのインストール
   ```bash
   npm install
   ```

2. 環境変数の設定
   ```bash
   cp .env.example .env
   # .env の中身を編集します
   ```
   - `VITE_USE_MOCK_COGNITO`:
     - `true` の場合、AWS に接続せず、ダミーのログイン処理 (`MockAuthProvider`) を行います。
     - `false` の場合、実際の AWS Cognito (`AmplifyAuthProvider`) へ接続します。

3. 開発サーバーの起動
   ```bash
   npm run dev
   ```

## E2E テスト (Playwright)

当プロジェクトでは Playwright を用いた E2E テストを導入しており、2種類のシナリオを用意しています。
テストを実行すると、自動的にフロントエンドとバックエンド (モックサーバー) が立ち上がります。

### モック環境でのテスト
AWS に依存しない高速な E2E テストです。
```bash
npm run test:e2e
```

### 実環境 (Cognito) でのテスト
実際の AWS インフラ (Hosted UI) を経由してログインし、データを取得する結合テストです。
実行前に、AWS 上にインフラがデプロイされ、`.env` に本番用の設定（およびテスト用ユーザー情報）が書き込まれている必要があります。
```bash
npm run test:e2e:real
```

## Lint
```bash
npm run lint
```
(Vite テンプレートに標準搭載されている高速な Linter `oxlint` を使用しています)
