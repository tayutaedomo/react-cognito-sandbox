import os
from abc import ABC, abstractmethod
from typing import Any

import boto3
from aws_lambda_powertools import Logger

# main.py の logger をインポートするのではなく、
# child=True または新しいインスタンスを作っても、Powertoolsは内部でコンテキストを共有可能（設定次第）だが、
# ここでは同じサービス名で初期化して利用する。
# Powertools の Logger はデフォルト設定では同じ service 単位で context 等が共有されるわけではなく
# global な contextvars などを共有するためには child logger を使うか
# 同等のアプローチを取る。
# 実際には、FastAPI 経由で Logger を渡す(DI)ほうが確実だが、
# importして使う場合は contextvars を使っているため動作する。
logger = Logger(service="backend-api")

class UserRepository(ABC):
    @abstractmethod
    def list_users(self) -> list[dict[str, Any]]:
        pass


class MockUserRepository(UserRepository):
    def list_users(self) -> list[dict[str, Any]]:
        logger.info("Fetched users from mock repository")
        return [
            {"id": "user1", "email": "user1@example.com", "status": "CONFIRMED"},
            {"id": "user2", "email": "user2@example.com", "status": "CONFIRMED"},
        ]


class CognitoUserRepository(UserRepository):
    def __init__(self):
        self.client = boto3.client(
            "cognito-idp", region_name=os.getenv("COGNITO_REGION", "ap-northeast-1")
        )
        self.user_pool_id = os.getenv("COGNITO_USER_POOL_ID")

        if not self.user_pool_id:
            raise ValueError("COGNITO_USER_POOL_ID environment variable is not set")

    def list_users(self) -> list[dict[str, Any]]:
        response = self.client.list_users(UserPoolId=self.user_pool_id, Limit=50)

        users = []
        for user in response.get("Users", []):
            email = next(
                (
                    attr["Value"]
                    for attr in user.get("Attributes", [])
                    if attr["Name"] == "email"
                ),
                None,
            )
            users.append(
                {
                    "id": user.get("Username"),
                    "email": email,
                    "status": user.get("UserStatus"),
                }
            )
        logger.info("Successfully fetched users from Cognito", extra={"user_count": len(users)})
        return users


def get_user_repository() -> UserRepository:
    # 開発環境等で USE_MOCK_COGNITO が 1 または true の場合はモックを使う
    use_mock = os.getenv("USE_MOCK_COGNITO", "1").lower() in ("1", "true")
    if use_mock:
        return MockUserRepository()
    return CognitoUserRepository()
