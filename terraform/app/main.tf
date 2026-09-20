# ==============================================================================
# Terraform Settings & Provider
# ==============================================================================
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"
  default_tags {
    tags = {
      Project = "react-cognito-sandbox"
    }
  }
}

# ==============================================================================
# Random String for uniqueness
# ==============================================================================
# Cognito ドメインなどを他と重複させないためのランダムなサフィックスを生成
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# ==============================================================================
# Cognito User Pool & Domain (Managed Login)
# ==============================================================================
# アプリケーションのユーザーを管理するプール
resource "aws_cognito_user_pool" "main" {
  name = "react-cognito-sandbox-pool"

  admin_create_user_config {
    allow_admin_create_user_only = var.allow_admin_create_user_only
  }

  # サインインにメールアドレスを使用する
  username_attributes = ["email"]
  # サインアップ時に自動で検証（認証コード送信）を行う属性
  auto_verified_attributes = ["email"]

  # セキュリティ強化のためのパスワードポリシー
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # パスワード忘れ時などのアカウント復旧メカニズムをメールに設定
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# アプリケーション（今回は SPA）が Cognito とやり取りするためのクライアント
resource "aws_cognito_user_pool_client" "main" {
  name         = "react-cognito-sandbox-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # フロントエンド（SPA）からの利用を想定しているためシークレットは生成しない
  generate_secret = false

  # Managed Login (Hosted UI) を利用するために IDP として COGNITO を指定
  supported_identity_providers = ["COGNITO"]

  # クライアントが読み書き可能なユーザー属性の権限設定
  read_attributes = [
    "address", "birthdate", "email", "email_verified", "family_name", "gender", "given_name",
    "locale", "middle_name", "name", "nickname", "phone_number", "phone_number_verified",
    "picture", "preferred_username", "profile", "updated_at", "website", "zoneinfo"
  ]
  write_attributes = [
    "address", "birthdate", "family_name", "gender", "given_name",
    "locale", "middle_name", "name", "nickname", "phone_number",
    "picture", "preferred_username", "profile", "updated_at", "website", "zoneinfo"
  ]

  # OAuth フロー（Authorization Code Grant）を有効化し、認証後にコードを返すように設定
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  
  # 取得するトークンに含まれる情報（スコープ）の定義
  # - openid: OpenID Connect 準拠の ID トークンを取得するために必須
  # - email: ユーザーのメールアドレス属性にアクセスするために必要
  # - profile: email 以外の標準属性（name, phone_number等）にアクセスするために必要
  # - aws.cognito.signin.user.admin: Cognito 独自のスコープ。アクセストークンを使用してユーザー自身が属性更新 (updateUserAttributes) 等の API を呼び出すために必要
  allowed_oauth_scopes = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]

  # 認証・サインアウト成功後のリダイレクト先（今回はローカル開発環境の Vite アプリケーションを想定）
  callback_urls = var.callback_urls
  logout_urls   = var.callback_urls
}

# Managed Login 画面（Hosted UI）を提供するためのドメイン設定
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${random_string.suffix.result}"
  user_pool_id = aws_cognito_user_pool.main.id
}


# ==============================================================================
# Data Sources & Locals
# ==============================================================================
# 実行時の AWS アカウント ID やリージョン情報を動的に取得して ECR URI を組み立てる
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  image_uri = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/${var.project_name}-backend:latest"
}

# ==============================================================================
# IAM Roles & Policies (Lambda Execution)
# ==============================================================================

# Lambda 関数が AWS サービスにアクセスするためのベースとなる実行ロール
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-exec-${random_string.suffix.result}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# 最小限の Lambda 実行権限 (CloudWatch へのログ出力等) を付与
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Backend が Cognito Admin API (ListUsers 等) を呼び出すためのカスタム権限
resource "aws_iam_policy" "cognito_access" {
  name = "${var.project_name}-cognito-access-${random_string.suffix.result}"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = [
        "cognito-idp:ListUsers"
      ]
      Effect   = "Allow"
      Resource = aws_cognito_user_pool.main.arn
    }]
  })
}

# 作成した Cognito へのアクセス権限を Lambda の実行ロールにアタッチ
resource "aws_iam_role_policy_attachment" "lambda_cognito" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = aws_iam_policy.cognito_access.arn
}

# ==============================================================================
# Lambda Function
# ==============================================================================

# Lambda はアタッチ設定がなくても、`/aws/lambda/関数名` と完全一致する
# ロググループが事前に存在すれば、自動的にそれを認識してログを書き込みます。
# ここで明示的に定義しておかないと、Lambda が永久保存設定のロググループを
# 勝手に作成してしまい、terraform destroy 時に削除漏れ（孤立）が発生します。
resource "aws_cloudwatch_log_group" "backend_lambda" {
  name              = "/aws/lambda/${var.project_name}-backend"
  retention_in_days = 7
}

# バックエンド (FastAPI) を実行する Lambda 関数。
# Docker コンテナ (AWS Lambda Web Adapter 経由) で動かすため Image 形式を指定。
resource "aws_lambda_function" "backend" {
  function_name = "${var.project_name}-backend"
  role          = aws_iam_role.lambda_exec.arn
  package_type  = "Image"
  image_uri     = local.image_uri

  # コンテナビルド環境 (M1/M2 Mac等) に合わせて arm64 を指定
  architectures = ["arm64"]
  timeout       = 30

  environment {
    variables = {
      # アプリケーションが実行時に Cognito User Pool を特定するために渡す
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
      COGNITO_REGION       = data.aws_region.current.name
      # 本番環境では実 Cognito を使用するためモックモードを無効化
      USE_MOCK_COGNITO = "0"
    }
  }
}

# ==============================================================================
# API Gateway (HTTP API) & Cognito Authorizer
# ==============================================================================

# Lambda の前段に配置する API Gateway。安価かつ高速な HTTP API (v2) を使用。
resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.project_name}-api-${random_string.suffix.result}"
  protocol_type = "HTTP"

  # フロントエンドからのクロスオリジンリクエストを許可
  cors_configuration {
    allow_origins = var.cors_allowed_origins
    allow_methods = ["*"]
    allow_headers = ["*"]
  }
}

# HTTP API 用のデフォルトステージ。デプロイを自動化する。
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true
}

# Cognito で認証されたユーザーのみが API を叩けるようにする Authorizer。
# リクエストヘッダの Authorization に含まれる JWT トークンを自動検証する。
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.backend.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# API Gateway へのリクエストを Lambda へプロキシとして流すためのインテグレーション
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# FastAPI 側のルーティングにすべて流すキャッチオール (`/api/{proxy+}`) ルート。
# ここはセキュアにするため Cognito Authorizer を必須とする。
resource "aws_apigatewayv2_route" "api" {
  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = "ANY /api/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# ブラウザからの CORS プリフライトリクエスト (OPTIONS) を未認証で通過させる
resource "aws_apigatewayv2_route" "options" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "OPTIONS /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# ヘルスチェック用のエンドポイントは、未認証のまま監視ツール等から叩けるようにする
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# API Gateway から Lambda を呼び出すことを明示的に許可するポリシー
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# ==============================================================================
# UI Customization (Managed Login)
# ==============================================================================
resource "aws_cognito_user_pool_ui_customization" "main" {
  client_id    = aws_cognito_user_pool_client.main.id
  user_pool_id = aws_cognito_user_pool_domain.main.user_pool_id

  css = <<CSS
.logo-customizable {
  max-width: 70%;
  max-height: 70%;
}
.banner-customizable {
  padding: 10px 0px 10px 0px;
  background-color: #f4f4f4;
}
.background-customizable {
  background-color: #ffffff; 
}
.label-customizable {
  font-weight: 400;
  color: #333333;
}
.textDescription-customizable {
  padding-top: 10px;
  padding-bottom: 10px;
  display: block;
  font-size: 16px;
  color: #333333;
}
.submitButton-customizable {
  background-color: #646cff;
  color: #ffffff;
  border-radius: 4px;
}
.submitButton-customizable:hover {
  background-color: #535bf2;
}
.redirect-customizable {
  color: #646cff !important;
  font-weight: bold !important;
}
CSS

  image_file = filebase64("${path.module}/logo.jpg")
}
