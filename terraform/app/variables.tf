variable "project_name" {
  description = "Project name used as a prefix for all resources"
  type        = string
}

variable "callback_urls" {
  description = "List of allowed callback URLs for Cognito"
  type        = list(string)
}

variable "logout_urls" {
  description = "List of allowed logout URLs for Cognito"
  type        = list(string)
}

variable "cors_allowed_origins" {
  description = "List of allowed origins for API Gateway CORS"
  type        = list(string)
  default     = ["*"]
}

variable "allow_admin_create_user_only" {
  description = "管理者のみがユーザーを作成できるかどうか (自己サインアップの無効化)"
  type        = bool
  default     = false
}
