# E2E テスト (Playwright)

frontend・backend・Cognito を横断するシナリオを、アプリケーションから独立した Node パッケージとして管理します。

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
`PLAYWRIGHT_BASE_URL` の指定は可能ですが、既存のログインテストには `http://localhost:5173` 固定のコールバック待機もあるため、実環境テストはこの URL で実行してください。

## シナリオ一覧の確認

```bash
npm --prefix e2e run test:e2e -- --list
npm --prefix e2e run test:e2e:real -- --list
```

## 実行結果

`e2e/test-results/` にスクリーンショット・トレース、`e2e/playwright-report/` に HTML レポートを出力します。
いずれも Git の管理対象から除外しています。

[プロジェクト README へ戻る](../README.md)
