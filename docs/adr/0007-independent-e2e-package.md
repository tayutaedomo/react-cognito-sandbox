# ADR 0007: プロジェクト横断 E2E の独立配置

Date: 2026-10-09

## 目次

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Alternatives](#alternatives)
- [Consequences](#consequences)

## Status

Accepted

Accepted Date: 2026-10-09

## Context

Playwright のテストは frontend と backend を起動し、Cognito による認証から API 呼び出しまでを横断して検証する。
frontend 配下にテスト・設定・依存関係が置かれているため、プロジェクト全体の検証としての責務が分かりにくくなっている。

## Decision

ルート直下の `e2e/` を独立した Node パッケージとし、テスト・Playwright 設定・依存関係・環境変数のサンプル・実行手順を集約する。
アプリケーションの起動場所は `webServer.cwd` で明示し、モック実行時はモック設定とローカル API の接続先を指定する。
既存の4つのテストシナリオは保持する。

## Alternatives

- テストだけ移して依存関係を frontend に残す方式は、E2E の実行が frontend のパッケージ構成に依存するため見送る。
- npm workspaces による一括管理は、今回の移築には必須ではないため導入しない。

## Consequences

- frontend と backend を横断する検証の置き場と実行方法が明確になる。
- frontend の依存関係から Playwright と E2E 用 dotenv を分離できる。
- Node パッケージのインストール先とロックファイルが1組増える。
- アプリ用の環境変数は各アプリ配下、テスト用認証情報は E2E 配下で管理する。
- 既存の URL 固定や実環境テスト時のモック backend 起動は今回の移築では維持し、必要に応じて別の変更として検討する。
