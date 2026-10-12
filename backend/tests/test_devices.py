from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.devices import DeviceRepository, current_device_username
from app.main import app


def test_paginates_without_accepting_other_user():
    aws = Mock()
    aws.admin_list_devices.side_effect = [
        {"Devices": [{"DeviceKey": "first"}], "PaginationToken": "next"},
        {"Devices": [{"DeviceKey": "second"}]},
    ]
    assert DeviceRepository(aws, "pool").list_devices("self") == {
        "Devices": [{"DeviceKey": "first"}, {"DeviceKey": "second"}]
    }
    assert aws.admin_list_devices.call_args_list[1].kwargs == {
        "UserPoolId": "pool",
        "Username": "self",
        "Limit": 60,
        "PaginationToken": "next",
    }


def test_identity_requires_gateway_claims(monkeypatch):
    monkeypatch.setenv("USE_MOCK_COGNITO", "0")
    request = Request(
        {"type": "http", "headers": [(b"authorization", b"Bearer forged")]}
    )
    with pytest.raises(HTTPException) as error:
        current_device_username(request)
    assert error.value.status_code == 401
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test")
    request = Request(
        {
            "type": "http",
            "headers": [
                (
                    b"x-amzn-request-context",
                    b'{"authorizer":{"jwt":{"claims":{"sub":"sub","cognito:username":"verified-self"}}}}',
                )
            ],
        }
    )
    assert current_device_username(request) == "verified-self"


def test_devices_endpoint_authentication(monkeypatch):
    monkeypatch.setenv("USE_MOCK_COGNITO", "1")
    client = TestClient(app)
    assert client.get("/api/me/devices").status_code == 401
    assert client.get(
        "/api/me/devices?username=other",
        headers={"Authorization": "Bearer dummy_mock_token"},
    ).json() == {"Devices": []}


def test_api_uses_verified_identity_and_hides_aws_errors(monkeypatch):
    from botocore.exceptions import ClientError
    from fastapi import FastAPI

    from app.devices import router

    monkeypatch.setenv("USE_MOCK_COGNITO", "0")
    repo = Mock()
    repo.list_devices.return_value = {"Devices": [{"DeviceKey": "own"}]}
    monkeypatch.setattr("app.devices.get_device_repository", lambda: repo)
    application = FastAPI()
    application.include_router(router)

    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test")
    client = TestClient(
        application,
        headers={
            "x-amzn-request-context": '{"authorizer":{"jwt":{"claims":{"sub":"own-sub","cognito:username":"own-user"}}}}'
        },
    )
    response = client.get("/api/me/devices?username=victim")
    assert response.json() == {"Devices": [{"DeviceKey": "own"}]}
    assert response.headers["cache-control"] == "no-store"
    repo.list_devices.assert_called_once_with("own-user")
    repo.list_devices.side_effect = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "private details"}},
        "AdminListDevices",
    )
    response = client.get("/api/me/devices")
    assert response.status_code == 502
    assert "private details" not in response.text


@pytest.mark.parametrize(
    "context", ["not-json", "[]", '{"authorizer":{"jwt":{"claims":[]}}}', "{}"]
)
def test_invalid_adapter_context_fails_closed(monkeypatch, context):
    monkeypatch.setenv("USE_MOCK_COGNITO", "0")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test")
    request = Request(
        {"type": "http", "headers": [(b"x-amzn-request-context", context.encode())]}
    )
    with pytest.raises(HTTPException) as error:
        current_device_username(request)
    assert error.value.status_code == 401


DEVICE_KEY = "ap-northeast-1_00000000-0000-0000-0000-000000000001"


def test_device_mutations_use_only_the_verified_user():
    aws = Mock()
    repository = DeviceRepository(aws, "pool")
    repository.untrust_device("self", DEVICE_KEY)
    aws.admin_update_device_status.assert_called_once_with(
        UserPoolId="pool",
        Username="self",
        DeviceKey=DEVICE_KEY,
        DeviceRememberedStatus="not_remembered",
    )
    aws.admin_forget_device.assert_not_called()
    repository.delete_device("self", DEVICE_KEY)
    aws.admin_forget_device.assert_called_once_with(
        UserPoolId="pool", Username="self", DeviceKey=DEVICE_KEY
    )


@pytest.mark.parametrize(
    "operation,method", [("untrust", "post"), ("delete", "delete")]
)
def test_device_mutation_requires_authentication(monkeypatch, operation, method):
    monkeypatch.setenv("USE_MOCK_COGNITO", "1")
    client = TestClient(app)
    path = f"/api/me/devices/{DEVICE_KEY}" + (
        "/untrust" if operation == "untrust" else ""
    )
    assert getattr(client, method)(path).status_code == 401


@pytest.mark.parametrize(
    "operation,method", [("untrust", "post"), ("delete", "delete")]
)
def test_mutation_endpoint_is_self_only_and_hides_provider_errors(
    monkeypatch, operation, method
):
    from botocore.exceptions import ClientError
    from fastapi import FastAPI

    from app.devices import router

    monkeypatch.setenv("USE_MOCK_COGNITO", "0")
    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "test")
    repo = Mock()
    monkeypatch.setattr("app.devices.get_device_repository", lambda: repo)
    application = FastAPI()
    application.include_router(router)
    client = TestClient(
        application,
        headers={
            "x-amzn-request-context": '{"authorizer":{"jwt":{"claims":{"sub":"own-sub","cognito:username":"own-user"}}}}'
        },
    )
    path = f"/api/me/devices/{DEVICE_KEY}" + (
        "/untrust" if operation == "untrust" else ""
    )
    target = getattr(
        repo, "untrust_device" if operation == "untrust" else "delete_device"
    )
    response = getattr(client, method)(path + "?username=victim")
    assert response.status_code == 204
    assert response.headers["cache-control"] == "no-store"
    target.assert_called_once_with("own-user", DEVICE_KEY)
    target.side_effect = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "private details"}},
        "AdminForgetDevice",
    )
    response = getattr(client, method)(path)
    assert response.status_code == 404
    assert "private details" not in response.text
    target.side_effect = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "private details"}},
        "AdminForgetDevice",
    )
    response = getattr(client, method)(path)
    assert response.status_code == 502
    assert "private details" not in response.text
    assert (
        getattr(client, method)(path.replace(DEVICE_KEY, "invalid-key")).status_code
        == 422
    )


def test_access_log_uses_route_template_without_device_key(monkeypatch):
    monkeypatch.setenv("USE_MOCK_COGNITO", "1")
    logger = Mock()
    monkeypatch.setattr("app.main.logger", logger)
    response = TestClient(app).post(
        f"/api/me/devices/{DEVICE_KEY}/untrust",
        headers={"Authorization": "Bearer dummy_mock_token"},
    )
    assert response.status_code == 404
    logged = logger.info.call_args.kwargs["extra"]["http"]["path"]
    assert logged == "/api/me/devices/{device_key}/untrust"
    assert DEVICE_KEY not in logged
