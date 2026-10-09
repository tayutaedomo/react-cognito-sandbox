# POC 002: ログイン画面・ユーザー属性の制約

## 目的

Cognito のログイン画面をどこまでカスタマイズできるか、自己サインアップを制限できるか、ユーザー属性を GUI から編集する際にどのような制約があるかを検証する。

## 検証結果・制約

既存 README の検証記録をテーマ別に整理したものです。
現在の構成は [アーキテクチャ](../architecture.md) を参照してください。

### Managed Login (Hosted UI) のデザイン変更と仕様制約の検証

- Terraform (`aws_cognito_user_pool_ui_customization`) を用いて、Managed Login 画面のロゴ画像や CSS (背景色やボタンの色など) をカスタマイズできることを確認しました。
- **仕様の限界と制約**: サインアップ画面への直接遷移ができない点（単一のエントリポイントの強制）や、一部のリンクテキスト（"Sign up" リンクなど）の色がカスタム CSS から上書きできないという、Cognito Hosted UI 固有の制限を検証・特定しました。

### Managed Login における自己サインアップの制限検証

- 業務システム等で一般的に求められる「管理者のみがユーザーを作成できる（ユーザーによる勝手な登録を防ぐ）」要件を満たすため、Terraform の `admin_create_user_config` で `allow_admin_create_user_only = true` を設定できることを検証しました。
- この設定により、Managed Login 画面から「Sign up」への導線が完全に非表示となり、意図せぬアカウント追加をセキュアに防止できることを確認しました。

### Cognito デフォルト属性 (OIDC) の GUI 編集と仕様制約の検証

- Amplify SDK (`updateUserAttributes`) を用いて、フロントエンドから Cognito の標準属性 (name, family_name, birthdate 等) を直接更新できる GUI を実装しました。
- **スコープの制約**: クライアントから属性を更新するには、Terraform (App Client) 側で `read_attributes` / `write_attributes` を許可するだけでなく、OAuth スコープに Cognito 独自の `aws.cognito.signin.user.admin` を要求する必要があることを検証しました。
- **updated_at の制約**: OIDC 標準の `updated_at` 属性は、AWS (Cognito) 側では自動更新されません。そのため、アプリケーション側で現在時刻 (UNIXタイムスタンプ) を計算し、更新リクエストに毎回含めて送信する仕様となっています。
- **email 更新の制約**: `email` をサインインエイリアスとして利用している場合、単純な更新を許可すると次回以降のログインが不能になるリスクがあるため、フロントエンドからの直接編集は Read Only (更新不可) とするよう設計方針を定めました。

## 関連する設計決定

- [ADR 0004: ログイン画面への単一エントリポイント](../adr/0004-managed-login-single-entrypoint.md)

## 実行手順

- [Frontend: 起動](../../frontend/README.md)
- [E2E: モック・実環境のテスト](../../e2e/README.md)
- [Terraform: インフラ構築](../../terraform/README.md)

[POC 一覧へ戻る](./README.md)
