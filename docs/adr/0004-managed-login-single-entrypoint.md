# 4. フロントエンドからの Managed Login 遷移ボタンの統合 (単一エントリポイント)

Date: 2026-09-20

## Status

Accepted

## Context

ユーザー体験の観点から、フロントエンド (React アプリ) のトップ画面に「サインイン (ログイン)」と「サインアップ (新規登録)」のボタンを別々に配置し、クリック時に Cognito Managed Login のそれぞれの専用画面へ直接遷移させたいという要望があった。

しかし、AWS Amplify (Gen 2) が提供する `signInWithRedirect()` API の仕様上、セキュアな OAuth フロー (PKCE 等の State 管理) を維持したまま、直接 Managed Login の「サインアップ」や「パスワードリセット」といった特定画面へルーティングする公式な手段が提供されていない。
（無理に URL パラメータ等を操作して `/signup` へリダイレクトさせると、Amplify の State 管理と不整合を起こし、コールバック後のトークン取得フローが失敗するリスクがある。）

## Decision

フロントエンドには「ログイン」と「サインアップ」を分けた複数のボタンを配置せず、**「ログイン / 登録 / パスワード再設定」という単一のボタン (エントリポイント) に統合**する。
ユーザーにはまず Amplify の標準機能 (`signInWithRedirect()`) を通じて Managed Login の「ログイン画面」へ遷移してもらい、そこから Managed Login 内の各種リンク (Sign up, Forgot your password?) を選んで操作してもらう設計をベストプラクティスとして採用する。

## Consequences

### Positive
- Amplify の標準 OAuth フローに完全に従うため、認証のセキュリティ (PKCE) が担保され、バグや不整合が発生しない。
- 認証周りの UI とルーティングをすべて AWS (Managed Login) 側にオフロードできるため、フロントエンドのコードベースが極めてシンプルに保たれる。

### Negative
- 「直接サインアップ画面を開きたい」といったきめ細かい UX のカスタマイズ要件には応えられない。
- これらを細かく制御したい場合は、Managed Login の使用を諦め、Amplify の `signUp()` API 等を用いて React 内に独自の認証フォーム (または Amplify UI Components) を実装するアプローチへ切り替える必要がある。
