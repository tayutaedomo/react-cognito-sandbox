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
import logging

# ロギング設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
# Lambda環境では標準出力がCloudWatch Logsへ送られます
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(levelname)s: %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)

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
        logger.info(f"API accessed by user (mock): {sub}")
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
                
            logger.info(f"API accessed by user: {sub}")
            # PII (email 等) は返さず、一意な識別子である sub のみを返す
            return {"sub": sub}
            
        except Exception as e:
            logger.error(f"Failed to extract sub from token: {e}")
            # 検証自体は API Gateway が行っているはずなので、パースエラーは異常事態
            raise HTTPException(status_code=401, detail="Invalid token payload")


@app.get("/api/users")
def get_users(
    user: dict = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    # Repository を使ってユーザー一覧を取得
    return user_repo.list_users()
