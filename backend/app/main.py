from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

app = FastAPI(title="Backend API (Mock)")

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

def get_current_user(authorization: Optional[str] = Header(None)):
    """
    ローカル開発環境における API Gateway (Cognito Authorizer) のモック関数です。
    
    本番環境 (AWS 上) では、API Gateway にアタッチされた Cognito Authorizer が
    トークンの署名検証や有効期限のチェックを行うため、FastAPI 側でのトークン検証は不要です。
    
    この関数は、ローカル開発時にフロントエンドからのダミートークンを受け取り、
    認証されたユーザーのダミー情報を返す（API Gateway の振る舞いをシミュレートする）目的で配置されています。
    
    ※ 次のフェーズの実装にて、API Gateway が付与するヘッダー（x-apigateway-event等）から
       検証済みのユーザー情報（Claims）を取り出す処理に書き換えます。
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")
    
    token = authorization.split(" ")[1]
    if token != "dummy_mock_token":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return {"sub": "mock_user_123", "email": "mock@example.com"}

@app.get("/api/users")
def get_users(user: dict = Depends(get_current_user)):
    return [
        {"id": "user1", "email": "user1@example.com", "status": "CONFIRMED"},
        {"id": "user2", "email": "user2@example.com", "status": "CONFIRMED"},
    ]
