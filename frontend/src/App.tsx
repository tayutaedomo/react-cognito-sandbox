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
    <main className={`app-shell${user ? '' : ' landing'}`}>
      <header className="page-heading">
        <h1>React + Cognito POC</h1>
      </header>

      {!user ? (
        <section className="panel">
          <p>ログイン、新規登録、またはパスワードを忘れた場合の再設定は、以下のボタンから AWS Cognito Managed Login 画面へ進んでください。</p>
          <div className="landing-actions">
            <button className="button-primary" onClick={signIn} disabled={isLoading}>
              {isLoading ? '処理中...' : 'ログイン / 登録 / パスワード再設定 (Managed Login)'}
            </button>
            <button onClick={() => setCurrentView('device-poc')}>信頼するデバイス POC（SRP ログイン）</button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <p className="welcome">Welcome, {user.email}!</p>
            <div className="action-row">
              <button onClick={() => setCurrentView('profile')}>
                Edit Profile
              </button>
              <button onClick={signOut}>
                Sign Out
              </button>
              <button onClick={() => setCurrentView('mfa')}>
                MFA 設定
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Users API</h2>
            <button className="button-primary" onClick={fetchUsers}>Fetch Users</button>
            {error && <p className="feedback feedback--error" role="alert">{error}</p>}
            {users.length > 0 && (
              <ul className="user-list">
                {users.map((u: any) => (
                  <li key={u.id}>{u.email} ({u.status})</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default MainApp;
