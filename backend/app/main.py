from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.repositories import UserRepository, get_user_repository

app = FastAPI(title="Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


import os
import base64
import json
from aws_lambda_powertools import Logger

# Lambda Powertools による構造化 JSON ロギング
logger = Logger(service="backend-api")

# リクエストごとにロガーの状態(append_keys等)をクリアするためのミドルウェア
# FastAPI のような非同期/常駐環境では、リクエスト間の状態漏洩を防ぐために必要です。
# 同時に、ここで Powertools を使って完全に構造化されたアクセスログを出力します。
@app.middleware("http")
async def request_lifecycle_middleware(request, call_next):
    logger.clear_state()
    
    # 処理実行
    response = await call_next(request)
    
    # Uvicorn の標準アクセスログを抑制しているため、ここでアクセスログを JSON 出力
    # get_current_user で追加された sub も、この時点であればログに含まれます
    logger.info(
        "HTTP Access Log",
        extra={
            "http": {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "client_ip": request.client.host if request.client else None,
            }
        }
    )
    return response

def get_current_user(authorization: str | None = Header(None)):
    """
    ローカル開発環境ではモックトークンを検証し、
    本番環境では API Gateway の JWT Authorizer が検証済みのため、
    トークンのペイロード部分を Base64 デコードして sub を抽出します。
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")

    token = authorization.split(" ")[1]
    
    use_mock = os.environ.get("USE_MOCK_COGNITO", "1") == "1"
    if use_mock:
        if token != "dummy_mock_token":
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        sub = "mock_user_123"
        # このリクエスト中の後続のすべてのログに `sub` を自動で付与する
        logger.append_keys(sub=sub)
        logger.info("API accessed by user (mock)")
        return {"sub": sub}
    else:
        # 本番では API Gateway が署名と有効期限を検証済み。
        # トークンのペイロード(第2セグメント)をデコードして sub を取り出す。
        try:
            parts = token.split(".")
            if len(parts) != 3:
                raise ValueError("Invalid JWT format")
            
            # Base64URLデコード (パディング不足を補う)
            payload_b64 = parts[1]
            payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
            payload_json = base64.urlsafe_b64decode(payload_b64).decode("utf-8")
            payload = json.loads(payload_json)
            
            sub = payload.get("sub")
            if not sub:
                raise ValueError("Missing 'sub' in token payload")
                
            # Powertools: 後続のすべてのログ出力に自動的に `sub` を含める
            logger.append_keys(sub=sub)
            logger.info("API accessed by user")
            
            # PII (email 等) は返さず、一意な識別子である sub のみを返す
            return {"sub": sub}
            
        except Exception as e:
            logger.error(f"Failed to extract sub from token", exc_info=True)
            raise HTTPException(status_code=401, detail="Invalid token payload")


@app.get("/api/users")
def get_users(
    user: dict = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    # Repository を使ってユーザー一覧を取得
    return user_repo.list_users()
