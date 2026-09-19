import React, { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { MockAuthProvider } from './auth/MockAuthProvider';

function MainApp() {
  const { user, signIn, signOut, isLoading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!user) return;
    setError(null);
    try {
      const response = await fetch('http://localhost:8000/api/users', {
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
          <p>Please sign in to access the application.</p>
          <button onClick={signIn} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In (Mock)'}
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

function App() {
  return (
    <MockAuthProvider>
      <MainApp />
    </MockAuthProvider>
  );
}

export default App;
