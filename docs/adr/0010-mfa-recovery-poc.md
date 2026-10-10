# ADR 0010: TOTP 復旧を専用ユーザーと管理者 CLI で検証する

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

任意 MFA の本人向け設定画面は、ログイン後の操作を前提としている。
認証アプリを紛失し新しいログインを完了できないユーザーは、この画面から復旧できない。
管理者による有効設定の解除、新しいアプリへの登録置き換え、既存トークンへの影響を確認する必要がある。

## Decision

- OPTIONAL の専用テストユーザーで、IAM 認証した AWS CLI による MFA 無効化と全セッション失効を検証する。
- 本人の再登録には既存の設定画面を利用する。管理者の無効化と、旧シークレットを置き換える新しい登録検証を区別する。
- 復旧テストは明示的な専用コマンドで実行し、対象ユーザー名とプール設定のガードを設ける。ヘルパーの単体テストには AWS 接続を使わない。
- 発行済みトークンへの影響は、Cognito の本人向け API と API Gateway の JWT authorizer の両方で確認する。

## Alternatives

管理者用の復旧 API・画面は、本人確認、操作者の認可、監査、通知まで含めた運用設計が必要になる。
今回は Cognito の挙動を確認する範囲とし、その設計を決める前に権限の強い API をアプリへ追加しない。
ログイン前に本人が MFA を解除する経路も、別の本人確認手段が必要なため提供しない。

## Consequences

- 既存ユーザーに影響を与えず、紛失・再登録と既存セッションの挙動を繰り返し確認できる。
- CLI の復旧手順は本番のサポート運用を完成させるものではない。本人確認・承認・監査は別の設計対象となる。
- OPTIONAL で無効化して再登録する間は、パスワードのみで新しいログインができる。
- Cognito の全セッション失効と、保護された API の即時アクセス拒否は同じ保証として扱わない。

## References

- [TOTP 復旧 POC](../poc/007-mfa-recovery.md)
- [AWS：AdminSetUserMFAPreference](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserMFAPreference.html)
- [AWS：トークンの失効](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)
