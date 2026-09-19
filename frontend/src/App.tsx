import React, { useState } from 'react';
import { useAuth } from './auth/AuthContext';

function MainApp() {
  const { user, signIn, signOut, isLoading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!user) return;
    setError(null);
    try {
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:8000';
      const response = await fetch(`${apiEndpoint}/api/users`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>React + Cognito POC</h1>
      
      {!user ? (
        <div>
          <p>ログイン、新規登録、またはパスワードを忘れた場合の再設定は、以下のボタンから AWS Cognito Managed Login 画面へ進んでください。</p>
          <button onClick={signIn} disabled={isLoading} style={{ padding: '10px 20px', fontSize: '16px' }}>
            {isLoading ? '処理中...' : 'ログイン / 登録 / パスワード再設定 (Managed Login)'}
          </button>
        </div>
      ) : (
        <div>
          <p>Welcome, {user.email}!</p>
          <button onClick={signOut}>Sign Out</button>
          
          <hr />
          <h2>Users API</h2>
          <button onClick={fetchUsers}>Fetch Users</button>
          
          {error && <p style={{ color: 'red' }}>{error}</p>}
          
          {users.length > 0 && (
            <ul>
              {users.map((u: any) => (
                <li key={u.id}>{u.email} ({u.status})</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default MainApp;
