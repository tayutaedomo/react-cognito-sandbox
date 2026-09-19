# Terraform (Infrastructure as Code)

このディレクトリには、プロジェクトのインフラを構築するための Terraform コードが格納されています。

## ディレクトリ構成

- `ecr/`: Docker コンテナイメージを格納するための Amazon ECR リポジトリを管理します。
- `app/`: アプリケーションの本体（Cognito, Lambda, API Gateway, IAM 等）を管理します。

※ Lambda を構築する前に ECR にイメージが Push されている必要があるため、State を2つに分割しています。

## デプロイ手順

初回デプロイ時は、以下の順序で実行する必要があります。

### 1. ECR の作成
```bash
cd terraform/ecr
terraform init
terraform apply
```

### 2. コンテナイメージの Build & Push
ECR リポジトリが作成されたら、バックエンドのコンテナイメージをビルドして Push します。
```bash
cd ../../
./backend/scripts/deploy.sh
```

### 3. アプリケーション本体のデプロイ
コンテナイメージが ECR に配置されたら、Lambda や API Gateway、Cognito などの本体を構築します。
```bash
cd terraform/app
terraform init
terraform apply
```

## 環境変数 (direnv)
実行には以下の環境変数が設定されている必要があります。（ルートディレクトリの `.envrc` に記載）
- `AWS_PROFILE`
- `AWS_REGION`
