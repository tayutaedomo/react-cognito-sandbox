# 仮パスワードでの初回ログイン

管理者が作成したユーザーが、Cognito Managed Login で仮パスワードを変更し、初回サインインを完了できるかを確認します。

## 目次

- [検証構成](#検証構成)
- [手順](#手順)
- [結果](#結果)
- [制約](#制約)

## 検証構成

| 項目 | 設定 |
| --- | --- |
| リージョン | 東京 (`ap-northeast-1`) |
| ログイン画面 | Cognito Managed Login、バージョン1 |
| ユーザー作成 | 管理者作成、招待メール送信を抑止 |
| 初期パスワード | Cognito が要求する仮パスワード |
| MFA | 無効 |
| コールバック | ローカルアプリ (`http://localhost:5173`) |

テスト用ユーザーと仮パスワードは検証環境でのみ使用し、この文書やテスト成果物には記録しません。

## 手順

1. 管理者 API で専用ユーザーを作成し、招待メッセージを抑止して仮パスワードを設定する。
2. Managed Login を開き、ユーザー名と仮パスワードでサインインする。
3. 画面の案内に従って新しいパスワードを設定する。
4. ローカルアプリへ戻り、サインイン済み画面が表示されることを確認する。
5. Cognito のユーザー状態を読み取り、`CONFIRMED` になったことを確認する。

## 結果

初回サインイン時に Managed Login が仮パスワード変更を案内し、変更後にアプリへ戻ることを確認しました。ユーザーからブラウザでログイン成功の報告があり、Cognito のユーザー状態も `CONFIRMED` でした。招待メールを抑止したため、メール配送は発生していません。

## 制約

この検証は Managed Login の初回ログイン経路を対象とします。アプリ独自の SRP ログイン画面で `NEW_PASSWORD_REQUIRED` を処理する動作は検証していません。仮パスワードの有効期限や期限切れ後の管理者再発行も対象外です。

参考：[AWS: ユーザーアカウントの作成と管理](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html)、[AWS: Cognito の認証フロー](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication.html)。
