#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REGION="${AWS_REGION:-ap-northeast-1}"
PROFILE="${AWS_PROFILE:-tayutae}"

POOL_ID="$(terraform -chdir="$TF_DIR" output -raw cognito_user_pool_id)"
CLIENT_ID="$(terraform -chdir="$TF_DIR" output -raw cognito_user_pool_client_id)"
BRANDING_ID="$(AWS_PROFILE="$PROFILE" aws cognito-idp describe-managed-login-branding-by-client \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --region "$REGION" \
  --query 'ManagedLoginBranding.ManagedLoginBrandingId' \
  --output text)"

REQUEST_FILE="$(mktemp)"
trap 'rm -f "$REQUEST_FILE"' EXIT

LOGO_BASE64="$(base64 < "$TF_DIR/logo.jpg" | tr -d '\n')"
jq -n \
  --arg pool_id "$POOL_ID" \
  --arg branding_id "$BRANDING_ID" \
  --arg logo "$LOGO_BASE64" \
  --slurpfile settings "$TF_DIR/managed-login-v2-settings.json" \
  '{
    UserPoolId: $pool_id,
    ManagedLoginBrandingId: $branding_id,
    Settings: $settings[0],
    Assets: [{
      Bytes: $logo,
      Category: "FORM_LOGO",
      ColorMode: "LIGHT",
      Extension: "JPEG"
    }]
  }' > "$REQUEST_FILE"

AWS_PROFILE="$PROFILE" aws cognito-idp update-managed-login-branding \
  --cli-input-json "file://$REQUEST_FILE" \
  --region "$REGION" \
  --query 'ManagedLoginBranding.{BrandingId:ManagedLoginBrandingId,UseCognitoProvidedValues:UseCognitoProvidedValues}' \
  --output table
