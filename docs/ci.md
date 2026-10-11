# CI による変更の自動検証

GitHub Actions で AWS に接続しない検証を実行する。PR ごとの変更確認と、main へ反映されたコードの確認に使う。

## 目次

- [実行される検証](#実行される検証)
- [起動条件と失敗の扱い](#起動条件と失敗の扱い)
- [モック E2E の artifact](#モック-e2e-の-artifact)
- [手動で実施する検証](#手動で実施する検証)
- [構成とローカルでの確認](#構成とローカルでの確認)

## 実行される検証

| ジョブ | 検証内容 | 外部接続 |
| --- | --- | --- |
| Frontend・E2E ヘルパー | frontend の単体テスト・型チェック・ビルド、frontend／E2E／Terraform テストコードの oxlint、E2E ヘルパーの単体テスト | 依存パッケージの取得 |
| Backend | Ruff の Lint・整形チェック、モックと Moto による単体テスト | 依存パッケージの取得 |
| Terraform | fmt・app／ecr の validate、AWS 非接続の MFA 設定テスト | Terraform Provider の取得 |
| モック E2E | ローカル frontend とモック backend を起動して Chromium で画面操作 | 依存パッケージ・ブラウザの取得 |

ジョブは独立して並列実行する。AWS の資格情報・実ユーザーの資格情報は設定せず、リソースの作成・更新・デプロイは行わない。

## 起動条件と失敗の扱い

PR の作成・更新、main への Push、Actions 画面からの手動実行で起動する。同じブランチで新しい実行が始まった場合は古い実行を取り消す。

Lint は違反があれば（oxlint は警告も含む）、整形チェックはフォーマット差分があれば失敗する。CI 内でファイルを修正しない。整形チェックの対象は Ruff による Python と Terraform fmt による Terraform。JavaScript／TypeScript は既存の oxlint を使い、専用 Formatter は導入していない。

PR のマージを必ず止めるには、GitHub のブランチ保護または Ruleset で、このワークフローの各ジョブを必須チェックに指定する。ワークフローの追加だけではマージ禁止の設定にはならない。

## モック E2E の artifact

モック E2E を実行した場合、成功・失敗の両方で `mock-e2e-results` を14日間保存する。実行が取り消された場合や、セットアップに失敗して E2E が開始されなかった場合は保存しない。

| 保存先 | 内容 | 保存するタイミング |
| --- | --- | --- |
| `e2e/test-results/screenshots/` | テストが明示的に撮影するホーム・MFA・デバイス画面 | 成功時も保存 |
| `e2e/test-results/` の各テストフォルダー | 失敗時のスクリーンショット・トレースなど | 失敗時 |
| `e2e/playwright-report/` | HTML レポートと関連データ | 成功時も保存 |

Actions の実行結果ページの **Artifacts → mock-e2e-results** からダウンロードする。展開後の HTML レポートは、次のコマンドで開ける。

```bash
npx --prefix e2e playwright show-report <展開先のplaywright-reportディレクトリ>
```

キャプチャとトレースに含まれる認証情報はモック用の固定値。公開リポジトリの artifact は閲覧権限を持つ利用者が取得できるため、実 Cognito のテスト・実トークン・実シークレットをこのジョブに混ぜない。

## 手動で実施する検証

実 Cognito のログイン、TOTP 登録・復旧、信頼するデバイスの操作は [E2E 手順](../e2e/README.md#目的別の実行手順) に従って手動で実行する。AWS apply と各アプリのデプロイも CI の対象外。

実環境テストには専用の資格情報が必要で、ユーザーの設定やデバイス記録を変更するシナリオがある。モックテストの成功だけでは Cognito・IAM・API Gateway の実際の動作は確認できない。

## 構成とローカルでの確認

ワークフローは [ci.yml](../.github/workflows/ci.yml)。Ubuntu 24.04、Node.js 24、Python 3.13、uv 0.10.12、Terraform 1.5.7 を使う。npm・uv・Terraform はコミットされた lockfile を使い、Actions はリリースのコミット SHA に固定する。

ローカルでの確認方法は [Frontend](../frontend/README.md)、[Backend](../backend/README.md)、[Terraform](../terraform/README.md)、[E2E](../e2e/README.md) を参照する。Backend の CI と同じチェックは `uv run ruff check .` と `uv run ruff format --check .`、テストは `uv run python -m pytest`。
