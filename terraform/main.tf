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
# Cognito ドメインを他と重複させないためのランダムなサフィックスを生成
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# ==============================================================================
# Cognito User Pool & Domain (Managed Login)
# ==============================================================================
resource "aws_cognito_user_pool" "main" {
  name = "react-cognito-sandbox-pool"

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

resource "aws_cognito_user_pool_client" "main" {
  name         = "react-cognito-sandbox-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # フロントエンド（SPA）からの利用を想定しているためシークレットは生成しない
  generate_secret = false

  # Managed Login (Hosted UI) を利用するために IDP として COGNITO を指定
  supported_identity_providers = ["COGNITO"]

  # OAuth フロー（Authorization Code Grant）を有効化し、認証後にコードを返すように設定
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  # 取得するトークンに含まれる情報（スコープ）の定義
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  
  # 認証・サインアウト成功後のリダイレクト先（今回はローカル開発環境の Vite アプリケーションを想定）
  callback_urls                        = ["http://localhost:5173", "http://localhost:5173/"]
  logout_urls                          = ["http://localhost:5173", "http://localhost:5173/"]
}

# Managed Login 画面（Hosted UI）を提供するためのドメイン設定
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "react-auth-${random_string.suffix.result}"
  user_pool_id = aws_cognito_user_pool.main.id
}
