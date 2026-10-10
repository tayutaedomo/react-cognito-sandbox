# Frontend (React + Vite)

## 目次

- [概要](#概要)
- [環境構築と起動](#環境構築と起動)
- [E2E テスト (Playwright)](#e2e-テスト-playwright)
- [Lint](#lint)
- [単体テスト](#単体テスト)
  - [実行方法](#実行方法)
  - [AWS 通信を置き換える仕組み](#aws-通信を置き換える仕組み)
  - [単体テストと実環境 E2E の役割](#単体テストと実環境-e2e-の役割)

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

frontend と backend を横断する E2E テストは、ルート直下の `e2e/` で管理します。
環境設定と実行方法は [E2E README](../e2e/README.md) を参照してください。

## Lint
```bash
npm run lint
```
(Vite テンプレートに標準搭載されている高速な Linter `oxlint` を使用しています)

## 単体テスト

### 実行方法

```bash
npm run test:unit
```

Vitest が TypeScript のテストと対象コードを読み込み、実行時に JavaScript に変換します。
型チェックはテスト実行とは別です。アプリの型チェックは `npm run build` 内の `tsc -b` で行い、現在の対象は `src/` です。

### AWS 通信を置き換える仕組み

MFA サービスは、外から渡された API 関数を呼び出す構成です。
本番は Amplify Auth の関数、単体テストは `vi.fn()` で作るモック関数を渡します。
モックは指定した値・エラーを返し、呼び出しの回数や引数を記録します。実際の Cognito API を呼ばないため、AWS の接続先・資格情報・テストユーザーは不要です。
Vitest 自体が AWS 通信を自動的に禁止したり、Cognito を再現したりするわけではありません。

### 単体テストと実環境 E2E の役割

| 検証 | 対象 |
| --- | --- |
| 単体テスト | 6桁入力の確認、MFA 設定の解釈、API に渡す引数、エラー処理・再試行 |
| モック E2E | 登録・有効化・無効化の画面操作と表示 |
| 実環境 E2E | Cognito による登録・コード検証、次のログインでの MFA 要求、API 連携 |

単体テストの成功だけでは Cognito の実際の動作は確認できません。
ログイン後の MFA 設定画面の操作と実環境検証は [任意 MFA の検証手順](../docs/poc/006-optional-mfa.md) を参照してください。
