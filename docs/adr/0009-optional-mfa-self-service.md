# ADR 0009: 任意 TOTP MFA をログイン後の設定画面で管理する

## 目次

- [Status](#status)
- [Context](#context)
- [Decision](#decision)
- [Alternatives](#alternatives)
- [Consequences](#consequences)
- [References](#references)

## Status

Proposed

## Context

既存の認証は Amplify Auth の OAuth リダイレクトと Cognito Hosted UI を使う。
MFA が OPTIONAL の場合、Hosted UI は未登録ユーザーに TOTP 登録を促さない。
ユーザーがログイン後に自分の TOTP を登録し、有効化・無効化できる導線が必要となる。

## Decision

- サインインは既存の Hosted UI を維持し、React にログイン後の MFA 設定画面を追加する。
- Amplify の `fetchMFAPreference`、`setUpTOTP`、`verifyTOTPSetup`、`updateMFAPreference` を利用する。既存の `aws.cognito.signin.user.admin` スコープを持つ Access トークンで本人の設定を操作する。
- QR コードはローカル生成し、共有シークレットを外部の QR 生成サービス、アプリ独自の永続ストレージ、ログへ送らない。
- 登録検証と有効化の保存を別の操作として扱う。登録検証後の保存失敗では、有効化だけを再試行できる。
- 無効化は MFA 設定の変更とし、登録済みシークレットの削除や端末紛失からの復旧は行わない。
- 無効という設定から未登録と登録済みを推定しない。画面は新規登録と既存アプリの再有効化の両方を提供する。
- AWS 接続部分を注入できるサービスに分離し、単体テストとモック E2E で確認する。状態を変更する実環境 E2E は専用ユーザーで明示的に実行する。

## Alternatives

- 独自ログイン画面への移行はサインインチャレンジの実装も必要となる。任意 MFA の管理はログイン後の API で実現できるため、既存の認証経路を維持する。
- バックエンドに管理者 API を追加する方法は、本人の設定変更に不要な IAM 権限と認可処理を増やすため採用しない。

## Consequences

- パスワードでログイン後に認証アプリを登録し、次の新しいログインで MFA を要求できる。
- 設定変更は現在のログインセッションを終了させない。確認にはサインアウトと新しいブラウザセッションを使う。
- 登録検証後の保存失敗は部分成功となる。画面を離れても、登録済みアプリの有効化から再試行できる。
- QR とセットアップキーは検証成功・中断・画面終了時に UI から除去し、実環境 E2E のトレースやスクリーンショットに保存しない。
- この設定画面は任意 MFA の POC 用。必須プールでのユーザーごとの無効化は Cognito が拒否する。

## References

- [AWS：User pool MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
- [Amplify：Manage MFA settings](https://docs.amplify.aws/gen1/react/build-a-backend/auth/manage-mfa/)
- [任意 MFA の検証](../poc/006-optional-mfa.md)
