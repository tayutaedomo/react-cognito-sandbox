#!/bin/bash
set -e

# Move to the terraform directory to fetch outputs
cd "$(dirname "$0")/../../terraform/app"
APP_ID=$(terraform output -raw amplify_app_id)
BRANCH_NAME=$(terraform output -raw amplify_branch_name)
AWS_REGION=${AWS_REGION:-ap-northeast-1} # direnv またはデフォルト値を利用
USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
CLIENT_ID=$(terraform output -raw cognito_user_pool_client_id)
API_ENDPOINT=$(terraform output -raw api_endpoint)
COGNITO_DOMAIN_URL=$(terraform output -raw cognito_domain_url)
COGNITO_DOMAIN=${COGNITO_DOMAIN_URL#https://}
cd ../../frontend

echo "Updating .env from Terraform outputs..."
cat <<ENV_EOF > .env
VITE_COGNITO_REGION=$AWS_REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN
VITE_API_ENDPOINT=$API_ENDPOINT
VITE_USE_MOCK_COGNITO=${VITE_USE_MOCK_COGNITO:-false}
ENV_EOF

echo "Deploying to Amplify App: $APP_ID (Branch: $BRANCH_NAME)"

# Get deployment info
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "Commit: $COMMIT_HASH"

# Build (Vite will inject env vars)
echo "Building the application..."
npm run build

# Zip artifacts
ZIP_FILENAME="build-${COMMIT_HASH}.zip"
echo "Zipping build artifacts into ${ZIP_FILENAME}..."
rm -f dist/${ZIP_FILENAME}
cd dist
zip -r ${ZIP_FILENAME} . > /dev/null
cd ..

# Create deployment
echo "Creating deployment in AWS Amplify..."
CREATE_DEPLOYMENT_RES=$(aws amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --output json)

# Extract jobId and zipUploadUrl using python
JOB_ID=$(echo "$CREATE_DEPLOYMENT_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['jobId'])")
UPLOAD_URL=$(echo "$CREATE_DEPLOYMENT_RES" | python3 -c "import sys, json; print(json.load(sys.stdin)['zipUploadUrl'])")

if [ -z "$JOB_ID" ] || [ -z "$UPLOAD_URL" ]; then
    echo "Error: Failed to extract jobId or zipUploadUrl"
    exit 1
fi

echo "Uploading ${ZIP_FILENAME} to S3..."
curl -s -T dist/${ZIP_FILENAME} "$UPLOAD_URL"

echo "Starting deployment (Job ID: $JOB_ID)..."
aws amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH_NAME" --job-id "$JOB_ID" --output text

echo "Amplify deployment submitted successfully!"
echo "Evidence saved at: frontend/dist/${ZIP_FILENAME}"
