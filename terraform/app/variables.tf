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

variable "mfa_configuration" {
  description = "Cognito MFA policy: OFF, OPTIONAL, or ON (required)"
  type        = string
  default     = "OFF"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, OPTIONAL, or ON."
  }
}

variable "totp_enabled" {
  description = "Allow users to register an authenticator app for TOTP MFA"
  type        = bool
  default     = false
}

variable "device_tracking_enabled" {
  description = "Enable Cognito device tracking and opt-in remembered devices for the trusted-device POC"
  type        = bool
  default     = false
}
