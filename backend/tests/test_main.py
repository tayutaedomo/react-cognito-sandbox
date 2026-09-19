from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_get_users_unauthorized():
    response = client.get("/api/users")
    assert response.status_code == 401
    
def test_get_users_authorized():
    response = client.get("/api/users", headers={"Authorization": "Bearer dummy_mock_token"})
    assert response.status_code == 200
    assert isinstance(response.json(), list)
