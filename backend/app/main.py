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

def get_current_user(authorization: str | None = Header(None)):
    """
    ローカル開発環境ではモックトークンを検証し、
    本番環境では API Gateway の JWT Authorizer が検証済みのため緩く通します。
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
        return {"sub": "mock_user_123", "email": "mock@example.com"}
    else:
        # 本番では API Gateway が検証済み
        return {"sub": "real_user", "token_passed": True}


@app.get("/api/users")
def get_users(
    user: dict = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    # Repository を使ってユーザー一覧を取得
    return user_repo.list_users()
