# SES サンドボックスのメール MFA

TOTP・Managed Login・SRP・信頼するデバイスを維持し、メール MFA を追加する最小構成です。SMS、独自ドメイン、専用 IP、SES サンドボックス解除は含めません。

## 目次

- [構成と影響](#構成と影響)
- [SES の準備](#ses-の準備)
- [Cognito の適用と専用ユーザー](#cognito-の適用と専用ユーザー)
- [画面と手動検証](#画面と手動検証)
- [検証範囲](#検証範囲)

## 構成と影響

| 対象 | 設定・動作 |
| --- | --- |
| プール | Essentials 以上、OPTIONAL、TOTP とメール |
| 配送 | 東京の SES、送信元・受信先を所有確認 |
| 復旧 | `admin_only`。既存ユーザーを含め自己復旧を停止 |
| ユーザー | TOTP・メールを独立して有効化、優先または選択 |
| デバイス | SRP の信頼済みデバイスで MFA 省略を維持 |

[プールとユーザー、復旧の組み合わせ](../mfa-and-recovery.md)、[復旧方針の ADR 草案](../adr/0014-email-mfa-admin-recovery.md) を参照してください。

## SES の準備

Git 管理外のルート `.env` に `MFA_EMAIL_FROM` と `MFA_EMAIL_TO` を設定します。別の Gmail アドレスを使い、Gmail エイリアスはそれぞれ確認します。実アドレス・パスワードを `VITE_` 変数に入れません。準備スクリプトは AWS の入力を権限を限定した一時ファイルで渡し、終了時に削除して、アドレスをログやコマンド引数に表示しません。

```bash
npm --prefix e2e ci
node scripts/email-mfa.mjs identities
node scripts/email-mfa.mjs status
```

両方の SES 確認メールのリンクを開き、`status` で所有確認を確認します。既存の Identity へ確認メールは自動再送しません。

```bash
node scripts/email-mfa.mjs delivery
```

1通だけ配送し、Git 管理外の `.email-mfa-delivery.json` に送信試行を記録します。応答不明や失敗でも自動再送しません。Gmail の受信箱と迷惑メールを確認し、実際に受信した場合だけ次を実行します。受信できない場合は Cognito の変更を止め、原因を確認します。

```bash
node scripts/email-mfa.mjs confirm-delivery
node scripts/email-mfa.mjs tfvars
```

`email-identity.auto.tfvars.json` は Git 管理外です。SES で確認した実アドレスを含むため公開しません。SES の宛先制限は招待・登録確認・属性確認にも適用されます。

## Cognito の適用と専用ユーザー

既存の `terraform.tfvars` と `examples/mfa-email.tfvars.example` を重ねて plan を確認します。自動生成した SES ARN の設定も読み込まれます。通常の plan 出力は公開せず、実アドレスを含む JSON plan は成果物に保存しません。

```bash
terraform -chdir=terraform/app plan -var-file=examples/mfa-email.tfvars.example
# 差分を確認してから実施
terraform -chdir=terraform/app apply -var-file=examples/mfa-email.tfvars.example
```

Cognito は SES 送信に必要なサービスリンクロールを利用します。IAM の作成権限が必要です。**復旧設定は全ユーザーで管理者対応になります。** テスト終了後の戻し方は ADR 草案を参照してください。

ルート `.env` に `MFA_EMAIL_USER_POOL_ID` と `MFA_EMAIL_USER_PASSWORD` を設定します。パスワードはプールのポリシーを満たす値にします。

```bash
node scripts/email-mfa.mjs user
```

受信先の専用ユーザーを招待メールなしで作成し、所有確認済み email 属性と恒久パスワードを設定します。既存ユーザーのパスワードは上書きしません。途中で失敗した場合は管理者が状態を確認してください。

frontend の `VITE_EMAIL_MFA_ENABLED=true` はプールへの適用後に設定します。アドレスは含みません。このフラグは画面の利用可否表示であり、AWS の MFA 設定を変更しません。

## 画面と手動検証

| 目的 | 設定 | 新しい SRP ログインで確認 |
| --- | --- | --- |
| メール単独 | メールのみ有効 | メールの6桁コード |
| TOTP 優先 | 両方式有効、TOTP 優先 | 認証アプリのコード |
| メール優先 | 両方式有効、メール優先 | メールのコード |
| ログイン時に選択 | 両方式有効、優先なし | Cognito が返す方式の選択画面 |
| 信頼済み端末 | 同じブラウザを信頼 | MFA 省略、解除後の再要求 |

MFA 設定画面は認証アプリ・メール・ログイン時の方式を分けて表示します。メールの送信先と確認状態は本人の Cognito 属性です。未確認の場合は属性の確認コードで確認してから有効化します。送信先変更の新しい画面は追加しません。

ログインでは Cognito が返す方式と伏せ字の配送先を使用します。誤コードは再入力し、認証セッションが切れたらログインからやり直します。ログインコードの独立した再送ボタンはありません。登録済み TOTP やデバイス記憶は方式の無効化で削除しません。

実メール、コード、トークン、TOTP シークレットは撮影・テスト成果物に保存しません。手動送信は少数に限定します。

## 検証範囲

単体テストで方式の独立した有効化、優先設定・解除、未確認メールの拒否、選択ステップ、メールコード、誤入力からの再試行を検証します。AWS 非接続の Terraform plan では SES・プラン・復旧方針の前提条件を検証します。

モック E2E でメール有効化、3つの優先設定、SRP 方式選択と誤コード再試行を確認し、モックのみ画面キャプチャを保存します。実環境のメール配送と Cognito 認証はこの自動検証に含みません。

ローカル検証：frontend 単体テスト41件、E2E 補助テスト21件、Terraform plan 14件、モック E2E 5件が成功。Oxfmt・oxlint・ビルド・Terraform validate も成功。SES の両 Identity の所有確認と配送確認1通の受信を確認しました。Gmail では迷惑メールに分類されました。実 Cognito のメール MFA 認証は未検証です。
