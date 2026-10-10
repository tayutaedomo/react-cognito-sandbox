# 006: 任意 TOTP MFA の登録・有効化・無効化

## 目次

- [目的と構成](#目的と構成)
- [環境設定](#環境設定)
- [手動検証](#手動検証)
- [自動テスト](#自動テスト)
- [確認結果](#確認結果)
- [制約](#制約)
- [関連文書](#関連文書)

## 目的と構成

MFA OPTIONAL のプールで、ユーザーがログイン後に認証アプリを登録し、TOTP を有効化・無効化する。
サインインは Cognito Hosted UI を使い、本人の設定変更は React の「MFA 設定」画面から Amplify Auth を通じて行う。
バックエンドに管理者 API を追加せず、既存の `aws.cognito.signin.user.admin` スコープを利用する。

## 環境設定

既存環境の変数に OPTIONAL 用設定例を重ねる。
User Pool の再作成や他リソースへの変更を含まないことを確認して適用する。

```bash
terraform -chdir=terraform/app plan -var-file=terraform.tfvars \
  -var-file=examples/mfa-optional.tfvars.example -out=mfa-optional.tfplan
terraform -chdir=terraform/app apply mfa-optional.tfplan
```

OPTIONAL はプール全体の設定。登録済み TOTP やユーザーごとの MFA 設定を削除する操作ではない。

## 手動検証

1. 専用ユーザーの恒久パスワードを設定し、TOTP 未登録または無効の状態で開始する。
2. 新しいブラウザセッションでログインし、登録を強制されずにアプリへ戻ることを確認する。
3. 「MFA 設定」から「認証アプリを登録する」を選び、Google Authenticator 等で QR を読み込む。
4. 6桁コードを入力して有効化する。有効表示になり、QR とセットアップキーが消えることを確認する。
5. ホームに戻ってサインアウトし、新しいブラウザセッションでログインする。TOTP の要求と Users API の成功を確認する。
6. 設定画面で無効化する。次の新しいログインで TOTP 入力を要求されないことを確認する。
7. 登録済みアプリを再有効化する。QR 登録を繰り返さず、同じアプリのコードで次のログインができることを確認する。

登録中の誤コードはエラーになり、正しいコードを再入力できる。
登録を中断すると QR とキーを画面から除去する。
登録確認後の有効化が失敗した場合は、「有効化を再試行する」で設定保存だけをやり直す。

## 自動テスト

```bash
npm --prefix frontend run test:unit
npm --prefix frontend run build
npm --prefix frontend run lint
CI=1 npm --prefix e2e run test:e2e
```

実環境シナリオは専用の OPTIONAL 環境とユーザーを必要とする。
Git 管理外の `e2e/.env.mfa-optional` または `e2e/.env.e2e` に以下を設定する。

```dotenv
MFA_OPTIONAL_USER_EMAIL=dedicated-test-user@example.com
MFA_OPTIONAL_USER_PASSWORD=replace-with-test-password
```

```bash
CI=1 npm --prefix e2e run test:e2e:mfa-optional
```

このシナリオはユーザーの TOTP を登録・変更する。通常の実環境 E2E ではスキップし、専用コマンドで明示的に実行する。
開始時は TOTP 未登録または無効にする。正常終了時は無効に戻すが、シークレットの関連付けは保持する。
中断・失敗時は変更済みの場合があるため、専用ユーザーの状態を確認してから再実行する。
各ログインには Cookie と保存領域を引き継がないブラウザコンテキストを使う。
QR、シークレット、コード、トークンをトレースやスクリーンショットに保存しない。失敗時のページスナップショットも無効化する。

## 確認結果

| 検証 | 結果 |
| --- | --- |
| 単体テスト16件 | 設定の読み取り、6桁入力検証、誤コード例外の区別、有効化・無効化、設定保存の再試行が成功 |
| モック E2E 3件 | API 連携、登録・誤入力からの再試行・無効化・再有効化、中断時の QR・キー除去が成功 |
| 実 Cognito E2E 1件 | OPTIONAL で登録、誤コード拒否と再試行、TOTP 付きログイン、認証済み API 200、無効化後のパスワード認証、再有効化後の同じ認証アプリによるログインが成功 |
| フロントエンドのビルド・静的解析 | 成功 |

実環境の検証は Essentials・Hosted UI classic（バージョン1）で実施した。
コードは専用テストユーザーのシークレットから生成し、各ログインを新しいブラウザコンテキストで確認した。
この設定画面の QR を Google Authenticator で読み込む手動検証は、自動テストとは別の確認となる。

## 制約

- 無効化はシークレット削除ではない。登録済みアプリを使って再有効化できる。
- 設定 API が返すのは有効な方式と優先設定。無効という結果だけでシークレットの有無は判定できない。
- MFA ON で TOTP を使ったことと、OPTIONAL でユーザー個別の有効設定を持つことは分けて確認する。移行後は設定 API の結果を確認し、登録済みアプリがある場合は新しい QR の登録より先に再有効化を試す。無効表示だけで登録が削除されたと判断しない。
- 設定変更は既存セッションや発行済みトークンを終了させない。新しいログインで要求の違いを確認する。
- 登録検証の誤コードでは `CodeMismatchException` に加え `EnableSoftwareTokenMFAException` が返る場合がある。画面では検証時の誤コードと設定有効化時のエラーを区別する。
- 必須プールでの無効化、端末紛失からの復旧、SMS・メール MFA は対象外。

参考: [AWS：VerifySoftwareToken](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_VerifySoftwareToken.html)、[AWS：ユーザーごとの MFA 設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)。

## 関連文書

- [MFA の認証フロー](../mfa-flows.md)
- [ADR 0009 草案](../adr/0009-optional-mfa-self-service.md)
- [POC 一覧](./README.md)
