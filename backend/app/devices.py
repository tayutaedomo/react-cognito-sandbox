"""本人限定のデバイス一覧。API Gateway が検証した claims のみを使用する。"""

import json
import os

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Request, Response

router = APIRouter()


def current_device_username(request: Request) -> str:
    if os.getenv("USE_MOCK_COGNITO", "1") == "1":
        if request.headers.get("authorization") != "Bearer dummy_mock_token":
            raise HTTPException(401, "Authentication required")
        return "mock_user_123"
    # Web Adapter はこのヘッダーをイベントの requestContext で上書きする。
    # Lambda 外では、クライアントが任意に付けたヘッダーを信用しない。
    if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
        raise HTTPException(401, "Verified user identity required")
    try:
        context = json.loads(request.headers.get("x-amzn-request-context", "{}"))
        claims = context.get("authorizer", {}).get("jwt", {}).get("claims", {})
        if not isinstance(claims, dict):
            raise TypeError("Invalid claims")
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(401, "Verified user identity required") from None
    username = claims.get("cognito:username") or claims.get("username")
    if not claims.get("sub") or not isinstance(username, str) or not username:
        raise HTTPException(401, "Verified user identity required")
    return username


class DeviceRepository:
    def __init__(self, client, pool_id):
        self.client = client
        self.pool_id = pool_id

    def list_devices(self, username: str) -> dict:
        devices = []
        pagination_token = None
        while True:
            arguments = {"UserPoolId": self.pool_id, "Username": username, "Limit": 60}
            if pagination_token:
                arguments["PaginationToken"] = pagination_token
            response = self.client.admin_list_devices(**arguments)
            devices.extend(response.get("Devices", []))
            pagination_token = response.get("PaginationToken")
            if not pagination_token:
                return {"Devices": devices}


def get_device_repository():
    return DeviceRepository(
        boto3.client(
            "cognito-idp", region_name=os.getenv("COGNITO_REGION", "ap-northeast-1")
        ),
        os.environ["COGNITO_USER_POOL_ID"],
    )


@router.get("/api/me/devices")
def own_devices(
    response: Response,
    username: str = Depends(current_device_username),
):
    response.headers["Cache-Control"] = "no-store"
    if os.getenv("USE_MOCK_COGNITO", "1") == "1":
        return {"Devices": []}
    try:
        return get_device_repository().list_devices(username)
    except ClientError:
        # AWS の詳細応答やデバイス情報をログ・エラーへ含めない。
        raise HTTPException(502, "Device information unavailable") from None
