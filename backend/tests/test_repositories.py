import os

import boto3
import pytest
from moto import mock_aws

from app.repositories import CognitoUserRepository, MockUserRepository


def test_mock_user_repository():
    repo = MockUserRepository()
    users = repo.list_users()

    assert len(users) == 2
    assert users[0]["id"] == "user1"
    assert users[0]["email"] == "user1@example.com"
    assert users[0]["status"] == "CONFIRMED"


def test_cognito_user_repository_missing_env():
    # COGNITO_USER_POOL_ID が無い場合の挙動
    if "COGNITO_USER_POOL_ID" in os.environ:
        del os.environ["COGNITO_USER_POOL_ID"]

    with pytest.raises(
        ValueError, match="COGNITO_USER_POOL_ID environment variable is not set"
    ):
        CognitoUserRepository()


@mock_aws
def test_cognito_user_repository_list_users():
    os.environ["COGNITO_REGION"] = "ap-northeast-1"

    # moto を用いて仮想の Cognito IDP をセットアップ
    client = boto3.client("cognito-idp", region_name="ap-northeast-1")
    pool_response = client.create_user_pool(PoolName="test_pool")
    pool_id = pool_response["UserPool"]["Id"]

    os.environ["COGNITO_USER_POOL_ID"] = pool_id

    # ダミーユーザーを作成
    client.admin_create_user(
        UserPoolId=pool_id,
        Username="testuser",
        UserAttributes=[
            {"Name": "email", "Value": "test@example.com"},
            {"Name": "email_verified", "Value": "true"},
        ],
        MessageAction="SUPPRESS",
    )

    repo = CognitoUserRepository()
    users = repo.list_users()

    assert len(users) == 1
    assert users[0]["id"] == "testuser"
    assert users[0]["email"] == "test@example.com"
    assert (
        users[0]["status"] == "FORCE_CHANGE_PASSWORD"
    )  # admin_create_user で作成直後のデフォルト
