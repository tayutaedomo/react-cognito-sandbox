# E2E テスト (Playwright)

frontend・backend・Cognito を横断するシナリオを、アプリケーションから独立した Node パッケージとして管理します。

## 目次

- [セットアップ](#セットアップ)
- [モック環境](#モック環境)
- [実環境 (Cognito)](#実環境-cognito)
- [TOTP MFA](#totp-mfa)
- [シナリオ一覧の確認](#シナリオ一覧の確認)
- [実行結果](#実行結果)

## セットアップ

以下のコマンドはプロジェクトルートで実行します。

```bash
npm --prefix frontend ci
uv sync --project backend
npm --prefix e2e ci
cd e2e
npx playwright install chromium
```

以下のテスト実行コマンドはプロジェクトルートで実行します。

## モック環境

```bash
npm --prefix e2e run test:e2e
```

Playwright が frontend（5173番）と backend（8000番）を起動し、ログインからユーザー一覧取得までを検証します。
frontend は `VITE_USE_MOCK_COGNITO=true` とローカル API、backend は `USE_MOCK_COGNITO=1` を指定して起動するため、AWS の認証情報は不要です。
アプリの依存関係がセットアップ済みなら、モック用の `.env` は不要です。

ローカルでは既に起動したサーバーを再利用します。再利用する場合はモードと接続先を確認してください。
自動起動と終了を含めて確認する場合は、両ポートが空いている状態で `CI=1 npm --prefix e2e run test:e2e` を実行します。

## 実環境 (Cognito)

AWS 上のインフラとテスト用ユーザーを用意し、`frontend/.env` に Cognito と API Gateway の接続設定を記載します。
テスト用ユーザー情報は `e2e/.env.e2e` に設定します。

```bash
cp e2e/.env.e2e.example e2e/.env.e2e
# TEST_USER_EMAIL と TEST_USER_PASSWORD を編集します
npm --prefix e2e run test:e2e:real
```

`test:e2e:real` は `VITE_USE_MOCK_COGNITO=false` を指定し、モックテストをスキップします。
Cognito 経由のログインと API 呼び出し、パスワードリセット画面への遷移、プロフィール編集を検証します。
プロフィール編集テストはテスト用ユーザーの名前・電話番号を更新します。
frontend はローカルで起動し、実環境の API を利用します。既存の起動構成を維持するため、ローカルのモック backend も起動します。

既存の `frontend/.env.e2e` を使っている場合は `e2e/.env.e2e` に移してください。
既定のテスト対象は `http://localhost:5173` です。`PLAYWRIGHT_BASE_URL` を指定すると、公開したフロントエンドでも認証後のコールバックまで検証できます。
指定先の URL が Cognito の許可済みコールバックに含まれていることを確認してください。公開ページを対象にする場合も、現在の設定ではローカル frontend/backend を起動します。

## TOTP MFA

初回登録は手動で行います。登録済みの専用ユーザーの Base32 シークレットを
`e2e/.env.e2e` の `TEST_USER_TOTP_SECRET` に設定すると、ログインと属性編集テストがパスワードの後に TOTP を入力します。
未設定の場合は従来のパスワード認証です。MFA 有効ユーザーを使う場合は設定が必要です。
実環境のトレースは無効化しています。QR コード・シークレット・コードは検証記録に含めないでください。
同じユーザーの使用済み TOTP が拒否されるため、次の30秒枠を待ちます。ログインを含むテストの制限時間は60秒です。
Hosted UI classic（バージョン1）で検証し、Managed Login バージョン2は未検証です。詳細は [MFA POC 手順](../docs/poc/005-mfa-foundation.md) を参照してください。

コード生成の単体テストは AWS なしで実行できます。

```bash
npm --prefix e2e run test:unit
```

## シナリオ一覧の確認

```bash
npm --prefix e2e run test:e2e -- --list
npm --prefix e2e run test:e2e:real -- --list
```

## 実行結果

`e2e/test-results/` にスクリーンショット・トレース、`e2e/playwright-report/` に HTML レポートを出力します。
いずれも Git の管理対象から除外しています。

[プロジェクト README へ戻る](../README.md)
