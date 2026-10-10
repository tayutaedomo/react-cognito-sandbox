# ADR 0008: 既存のリダイレクト認証を使った MFA POC の足場

Date: 2026-10-10

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

Cognito MFA を TOTP 必須、TOTP 任意、復旧、SMS・メールの順に検証する。
現在の React は Amplify Auth の `signInWithRedirect()` を使い、認証画面とチャレンジは Cognito に委ねている。
MFA 方針は User Pool 全体に影響するため、段階ごとに設定と検証結果を区別したい。

## Decision

- 既存の OAuth リダイレクト認証を維持し、最初は Cognito の画面で TOTP 必須を試す。
- Terraform に `mfa_configuration` (`OFF` / `OPTIONAL` / `ON`) と `totp_enabled` を追加する。
  デフォルトは `OFF` / `false` とし、必須 POC は追加の var-file で明示する。
- 今回提供する因子は TOTP のみ。`OPTIONAL` / `ON` と TOTP 無効の組み合わせは plan 時に拒否する。
- `OFF` では TOTP 設定ブロックを省略する。設定変更はユーザーの登録済みシークレットを削除する操作ではない。
- 初回登録は手動で検証する。登録済みの専用テストユーザーは E2E で TOTP を生成し、既存の API・属性編集のシナリオを継続する。
- 自動検証専用ユーザーの事前登録は Amplify の SRP / MFA_SETUP で行える。これはブラウザ上の初回 QR 登録の検証とは区別し、手動登録用ユーザーは未登録のまま用意する。
- AWS の画面バージョン・機能プランを確認してから適用する。classic / Managed Login の移行やプラン変更は今回のコードに含めない。
- アプリ内での任意 MFA 登録 UI、復旧用 Admin API、SMS・メールは後続の変更とする。

## Alternatives

- 最初から独自ログイン UI を作る案は、チャレンジ処理を追加する前に既存構成で MFA の基本挙動を確認できるため、今回の採用を見送る。
- 最初から複数因子を用意する案は、配送設定・プラン・復旧設計の準備が基本フローの検証に混ざるため、段階的な導入とする。

## Consequences

- 配送サービスを追加せずに TOTP 必須の POC を始められ、設定の組み合わせを AWS なしで plan 検証できる。
- `ON` は全ユーザーに影響する。専用テストユーザーでの確認と、既存ユーザーへの影響の把握が必要。
- `OPTIONAL` の設定だけでは未登録ユーザーの登録導線はできない。次のステップでアプリ内設定画面が必要。
- E2E のシークレットはテストユーザー専用とし、Git・スクリーンショット・トレースに残さない。
- 実測で Cognito が使用済み TOTP を拒否することを確認した。同じユーザーでの連続 E2E は次の30秒枠を待ち、テストの制限時間を60秒とする。
- MFA 必須という設定だけを根拠に、個々の API リクエストが直前に TOTP を通過したとは判断しない。
  初回登録、既存セッション、トークン更新の挙動はそれぞれ実測する。

## References

- [AWS: Adding MFA to a user pool](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)
- [AWS: TOTP software token MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html)
- [MFA POC の手順・検証記録](../poc/005-mfa-foundation.md)
