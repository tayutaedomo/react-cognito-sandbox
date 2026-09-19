#!/bin/bash
set -e

# スクリプトの存在するディレクトリの親(backend)に移動する
cd "$(dirname "$0")/.."

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-ap-northeast-1}
REPO_NAME="react-auth-poc-backend"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}:latest"

echo "Logging in to Amazon ECR..."
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

echo "Building Docker image..."
docker build --platform linux/arm64 -t ${REPO_NAME} .

echo "Tagging image..."
docker tag ${REPO_NAME}:latest ${IMAGE_URI}

echo "Pushing image to ECR..."
docker push ${IMAGE_URI}

if aws lambda get-function --function-name ${REPO_NAME} --region ${REGION} > /dev/null 2>&1; then
    echo "Updating Lambda function code..."
    aws lambda update-function-code --function-name ${REPO_NAME} --image-uri ${IMAGE_URI} --region ${REGION} > /dev/null
    echo "Deployment complete!"
else
    echo "Image pushed successfully. (Lambda function does not exist yet. Please run terraform apply in terraform/app to create it.)"
fi
