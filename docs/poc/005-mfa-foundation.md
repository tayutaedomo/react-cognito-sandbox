# 005: MFA の足場と TOTP 必須

## 目的と範囲

既存の Cognito リダイレクト認証で TOTP の登録・ログイン・API 連携を試す。
User Pool 方針 (`OFF` / `OPTIONAL` / `ON`) と TOTP 登録の可否を Terraform で設定する。
任意 MFA の登録画面、端末紛失時の復旧、SMS・メールは対象外。
利用者の操作とコンポーネント間の通信は [MFA の認証フロー](../mfa-flows.md) を参照する。

## ローカル検証

プロジェクトルートで実行する。

```bash
terraform -chdir=terraform/app init -backend=false -lockfile=readonly
terraform -chdir=terraform/app validate
node --test terraform/tests/mfa.test.mjs
npm --prefix e2e run test:unit
npm --prefix e2e run test:e2e -- --list
npm --prefix e2e run test:e2e:real -- --list
```

Terraform テストは Node.js 20 以上と、`terraform/app` の初期化済みプロバイダーを必要とする。
実際の User Pool 定義・変数を一時ディレクトリに取り出し、空の state から `plan -refresh=false` を実行する。
プロバイダーの認証確認とメタデータ取得を無効化し、ダミー認証情報を指定するため、AWS の接続・資格情報は不要。
既存 state・利用者の tfvars を変更せず、一時ファイルはテスト終了時に削除する。
ただし、アプリ全体の plan や AWS での実際の登録動作を保証するテストではない。

## 実環境の事前確認

AWS 設定の読み取りも有効な SSO セッションが必要。プロファイル・リージョンは対象環境に合わせる。

```bash
aws sso login --profile <AWS_PROFILE>
export AWS_PROFILE=<AWS_PROFILE>
export AWS_REGION=ap-northeast-1
```

Cognito コンソールまたは CLI で以下を確認する。

- User Pool の MFA 設定、TOTP の有効状態、機能プラン。
- ドメインの画面バージョン（Hosted UI classic / Managed Login）。Terraform の CSS カスタマイズは classic 用で、README の呼称だけでは実環境の画面を判定しない。
- MFA 登録用と登録済み E2E 用の専用テストユーザー。既存ユーザーも `ON` の対象になる。
- テストユーザーのメール検証・初期パスワード設定が完了していること。
- Terraform state の所在。ローカルの `terraform output` が空の場合は、既存リソースの state を確認してから進める。空の state からの新規作成を意図しないまま apply しない。

```bash
# <POOL_ID> と <DOMAIN_PREFIX> を対象環境の値に置き換える。
aws cognito-idp describe-user-pool --user-pool-id <POOL_ID> \
  --query 'UserPool.{Mfa:MfaConfiguration,Tier:UserPoolTier,Recovery:AccountRecoverySetting,Domain:Domain}'
aws cognito-idp get-user-pool-mfa-config --user-pool-id <POOL_ID>
aws cognito-idp describe-user-pool-domain --domain <DOMAIN_PREFIX> \
  --query 'DomainDescription.{Version:ManagedLoginVersion,Pool:UserPoolId}'
```

古い AWS CLI では `UserPoolTier` / `ManagedLoginVersion` が `null` になる場合がある。
`null` だけで設定なしと判断せず、コンソールまたは新しい SDK の結果を使う。

## TOTP 必須への切り替え

`terraform/app` で、既存の環境設定と POC 用設定を重ねる。

```bash
terraform plan -var-file=terraform.tfvars \
  -var-file=examples/mfa-required.tfvars.example -out=mfa-required.tfplan
```

User Pool が置き換えにならず、MFA 関連の更新を含むことを確認する。
他リソースへの変更が出た場合は理由を確認する。
適用内容を確認してから実行する。

```bash
terraform apply mfa-required.tfplan
```

デフォルトの `OFF` に戻す場合も plan を確認する。
`totp_enabled = false` だけでは、ユーザーの登録済み TOTP を削除できない。
既存の検証環境が `OPTIONAL` 等の場合は元の値を記録し、その値に戻す。

### 無効化・再有効化を繰り返す場合の制約

User Pool の MFA 方針は更新 API で `OFF` / `OPTIONAL` / `ON` に変更できる。
MFA 方針の切り替え自体に User Pool の再作成は不要。
以下は AWS の仕様確認による整理で、現在の実環境での往復切り替えは未検証。

| 操作 | 制約・注意点 |
| --- | --- |
| `ON → OFF → ON` | OFF は登録済み TOTP シークレットの削除ではない。再有効化は既存の登録状態を引き継ぐ前提で、初回 QR 登録のやり直しにはならない |
| プールの TOTP 因子を無効化 | 新しい TOTP の関連付け・検証ができなくなる。既に登録したユーザーは因子の無効化だけでは TOTP を利用できなくなるとは限らない。MFA 全体を止める操作は `mfa_configuration = "OFF"` と区別する |
| `ON / OPTIONAL` と `totp_enabled = false` | 今回は因子が TOTP のみなので、Terraform の precondition が拒否する。これは POC の設定ガードであり、AWS 全体の因子構成を制限するものではない |
| `ON → OPTIONAL` | 任意 MFA はユーザーの有効化・優先方式の設定にも依存する。必須時にログインできたことだけで、任意時にも同じ挙動になるとは判断しない |
| `ON` のままユーザーごとに無効化 | 必須 MFA ではユーザーが MFA を無効化できない。ユーザーごとの有効・無効の検証は OPTIONAL で行う |
| 未登録ユーザーで ON に戻す | MFA 登録が必要。登録を中断し、一時トークンを既に受け取った場合には、Hosted UI だけで再開できず MFA_SETUP の処理が必要な場合がある |
| 連続したログイン | 使用済み TOTP を再送すると拒否される。次の30秒枠のコードを使う |

切り替え後の検証には新しいブラウザコンテキストを使い、既存セッション・発行済みトークンの動作とは分けて確認する。
初回 QR 登録を繰り返し試す場合は、未登録の専用ユーザーを別に作ると、設定切り替えと登録状態のリセットを混同せずに検証できる。
実環境を切り替える前に現在値を記録し、検証後に元の ON / TOTP 有効へ戻す。

参考: [MFA 設定更新 API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SetUserPoolMfaConfig.html)、
[TOTP の制約](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html)、
[ユーザーごとの MFA 設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)。

## 手動検証

`frontend/.env` の実 Cognito・API 接続設定でアプリを起動する。
因子を確認するときは新しいブラウザコンテキストを使い、既存のログインセッションの再利用を区別する。

1. **既存・未登録ユーザー**: パスワード入力後の QR コード／シークレット表示、認証アプリ登録、6桁コードの検証、アプリへの復帰を確認する。
2. **新規ユーザー**: 許可されている登録方法でユーザーを作り、メール検証・初期パスワードと TOTP 登録の順序を記録する。
3. **登録済みユーザー**: サインアウトし、新しいブラウザコンテキストで再ログイン。TOTP 入力が必要なこと、成功後に `Fetch Users` が成功することを確認する。
4. **誤入力**: コードを1回誤入力し、認証完了せず、正しいコードで再試行できることを確認する。ロックアウトの詳細は対象外。
5. **既存セッション**: MFA 有効化前のセッションや再訪時にコードが再要求されるかを別に記録する。毎回のページ表示を再認証とみなさない。

初回認証には一時トークン等の特別な挙動があるため、「ON なら必ずすべての初回遷移で TOTP 入力済み」と推定しない。
詳細は [AWS の TOTP 仕様](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa-totp.html) を参照。
QR コード・シークレット・入力コード・JWT をスクリーンショットや検証記録へ貼り付けない。

## 登録済みユーザーの E2E

専用ユーザーの初回登録を手動で終え、登録時の Base32 シークレットを `e2e/.env.e2e` の `TEST_USER_TOTP_SECRET` に設定する。
このユーザーの TOTP は認証アプリにも保持しておく。シークレットはパスワードと同様に Git 管理しない。
実環境テストは User Pool 全体の設定を変更せず、登録済みユーザーのログインを行う。

```bash
npm --prefix e2e run test:e2e:real
```

シークレットがある場合、パスワード送信後に TOTP 入力を必須として待機する。
同じユーザーの使用済みコードを再送すると Cognito が拒否するため、次の30秒枠を待ってコードを生成する。
ログインを含むテストの制限時間は、この待機を含めて60秒とする。
ない場合は従来のパスワード認証を維持するため、MFA 有効ユーザーではコールバック待機に失敗する。
初回登録画面と登録済みの入力画面は異なる。自動登録や登録中断からの復旧はこの E2E に含めない。
現在のセレクターは Hosted UI classic（バージョン1）で確認する。Managed Login バージョン2は未検証。
実 Cognito のトレースを無効にして認証情報の記録を避ける。`--trace on` で上書きしない。

## 検証結果・未確認事項

| 項目 | 結果 |
| --- | --- |
| Terraform validate | 成功 |
| 既定 OFF、OFF＋TOTP、OPTIONAL＋TOTP、ON＋TOTP | AWS 非接続 plan テスト4件成功 |
| 因子なしの OPTIONAL / ON、不正なモード3種類 | エラー検証5件成功 |
| TOTP 生成 | RFC 6238 SHA-1 の標準値、時刻境界、不正入力を含む単体テスト9件成功 |
| E2E シナリオの読み込み | 成功 |
| ローカル frontend → 実 AWS の E2E | TOTP ログイン・API 呼び出し、プロフィール編集、パスワード再設定画面到達の3件成功。モック用1件スキップ |
| 公開した Amplify frontend → 実 AWS の E2E | 同じ3件成功、モック用1件スキップ。公開 URL への OAuth コールバックも確認 |
| モック E2E | 1件成功。frontend/backend の起動・終了を含めて確認 |
| 既存バックエンド単体テスト | 6件成功 |
| 追加した JavaScript / TypeScript の静的解析 | oxlint 成功 |
| 実環境のプラン・画面・MFA 状態 | Essentials、Hosted UI classic（1）、MFA ON、TOTP 有効、メール復旧を確認 |
| アプリ全体の実環境 plan / apply | 適用後の plan 差分なし |
| TOTP の初回登録 | Amplify の SRP / MFA_SETUP 経由で登録・検証 |
| 再ログイン・誤入力・API 連携 | 新規ログインの TOTP 要求、誤コードの拒否と正コードの再試行、認証済み API 200、未認証 API 401 を実測 |
| コードの再利用 | 連続したブラウザテストで使用済みコードの拒否を確認し、次の30秒枠を使うよう E2E を修正 |
| 画面移行、プラン変更、SMS・メール・任意登録 UI・復旧 | 今回の対象外 |

関連: [ADR 0008 草案](../adr/0008-mfa-poc-foundation.md)、[Terraform](../../terraform/README.md)、[E2E](../../e2e/README.md)
