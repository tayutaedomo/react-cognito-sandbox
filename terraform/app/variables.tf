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

variable "email_mfa_enabled" {
  description = "Enable email MFA with an owned SES identity"
  type        = bool
  default     = false
}

variable "ses_email_identity_arn" {
  description = "Verified SES sender identity ARN in ap-northeast-1"
  type        = string
  default     = null
  sensitive   = true
}

variable "user_pool_tier" {
  description = "Cognito feature plan; email MFA requires ESSENTIALS or PLUS"
  type        = string
  default     = null
  validation {
    condition     = var.user_pool_tier == null ? true : contains(["LITE", "ESSENTIALS", "PLUS"], var.user_pool_tier)
    error_message = "Choose LITE, ESSENTIALS, or PLUS."
  }
}

variable "account_recovery_mode" {
  description = "Password recovery policy: verified_email or admin_only"
  type        = string
  default     = "verified_email"
  validation {
    condition     = contains(["verified_email", "admin_only"], var.account_recovery_mode)
    error_message = "Choose verified_email or admin_only."
  }
}
