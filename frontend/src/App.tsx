import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import ProfileEditor from './components/ProfileEditor';
import MfaSettings from './components/MfaSettings';
import DevicePoc from './components/DevicePoc';

function MainApp() {
  const { user, signIn, signOut, isLoading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'profile' | 'mfa' | 'device-poc'>('home');

  if (currentView === 'device-poc') {
    return <DevicePoc onBack={() => setCurrentView('home')} />;
  }

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

  if (user && currentView === 'mfa') {
    return <MfaSettings onBack={() => setCurrentView('home')} />;
  }

  if (user && currentView === 'profile') {
    return <ProfileEditor onBack={() => setCurrentView('home')} />;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>React + Cognito POC</h1>
      
      {!user ? (
        <div>
          <p>ログイン、新規登録、またはパスワードを忘れた場合の再設定は、以下のボタンから AWS Cognito Managed Login 画面へ進んでください。</p>
          <button onClick={signIn} disabled={isLoading} style={{ padding: '10px 20px', fontSize: '16px' }}>
            {isLoading ? '処理中...' : 'ログイン / 登録 / パスワード再設定 (Managed Login)'}
          </button>
          <p><button onClick={() => setCurrentView('device-poc')}>信頼するデバイス POC（SRP ログイン）</button></p>
        </div>
      ) : (
        <div>
          <p>Welcome, {user.email}!</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setCurrentView('profile')} style={{ padding: '8px 16px' }}>
              Edit Profile
            </button>
            <button onClick={signOut} style={{ padding: '8px 16px' }}>
              Sign Out
            </button>
            <button onClick={() => setCurrentView('mfa')} style={{ padding: '8px 16px' }}>
              MFA 設定
            </button>
          </div>
          
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
