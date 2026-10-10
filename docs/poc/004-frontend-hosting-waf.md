# POC 004: フロントエンド配信・WAF

## 目次

- [目的](#目的)
- [検証結果・制約](#検証結果制約)
  - [Amplify Hosting への自動デプロイと WAF によるセキュアな配信](#amplify-hosting-への自動デプロイと-waf-によるセキュアな配信)
- [関連する設計決定](#関連する設計決定)
- [実行手順](#実行手順)

## 目的

フロントエンドのビルド成果物を Amplify Hosting にデプロイし、配信基盤に WAF とログ出力を組み合わせる構成を検証する。

## 検証結果・制約

既存 README の検証記録をテーマ別に整理したものです。
現在の構成は [アーキテクチャ](../architecture.md) を参照してください。

### Amplify Hosting への自動デプロイと WAF によるセキュアな配信

- Terraform を用いて `aws_amplify_app` と `aws_amplify_branch` を構築し、フロントエンドのビルド結果を S3 経由でシームレスにデプロイするスクリプトを実装しました。
- Amplify の前段には **AWS WAFv2** をアタッチし、アクセスログを CloudWatch Logs に出力するよう設定しました。この際、セキュリティのベストプラクティスに従い、WAF のログには JWT（個人情報）を一切記録せず、純粋な HTTP トラフィックの監視に留めるアーキテクチャを実現しました。

## 関連する設計決定

- [ADR 0006: Cognito セキュリティと WAF 戦略](../adr/0006-cognito-security-and-waf-strategy.md)

## 実行手順

- [Terraform: インフラ構築](../../terraform/README.md)

[POC 一覧へ戻る](./README.md)
