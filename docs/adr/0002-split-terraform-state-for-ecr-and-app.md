# 2. Terraform State の ECR と App の分割

Date: 2026-09-20

## Status

Proposed

## Context

AWS Lambda をコンテナイメージで稼働させる構成において、Terraform でインフラ全体を単一の State (`main.tf`) で管理しようとすると、「ECR リポジトリが存在しないと Lambda コンテナイメージを Push できない」「イメージが Push されていないと Lambda 関数（`aws_lambda_function`）のリソースを作成できない」という鶏と卵（デッドロック）の問題が発生する。

## Decision

Terraform のディレクトリ構造および State を以下の2つに分割し、ライフサイクルを分ける。
- `terraform/ecr`: ECR リポジトリのみを管理。
- `terraform/app`: Lambda 関数、API Gateway、Cognito、IAM などのアプリケーションリソースを管理。

## Consequences

### Positive
- `terraform/ecr` 適用 → イメージ Push → `terraform/app` 適用 という一方向の明確なデプロイフローを確立できる。
- `terraform destroy` を実行する際も、App リソースを先に削除し、その後に ECR を削除するという安全なクリーンアップが可能になる。

### Negative
- インフラ構築時に `terraform apply` を 2回（2つのディレクトリで）実行する必要がある。
