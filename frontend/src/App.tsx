import { useRef, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import ProfileEditor from './components/ProfileEditor';
import MfaSettings from './components/MfaSettings';
import DevicePoc from './components/DevicePoc';

function MainApp() {
  const { user, signIn, signOut, isLoading } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [pending, setPending] = useState<'signIn' | 'signOut' | 'users' | null>(null);
  const actionInProgress = useRef(false);
  const busy = isLoading || pending !== null;
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'home' | 'profile' | 'mfa' | 'device-poc'>('home');

  if (currentView === 'device-poc') {
    return <DevicePoc onBack={() => setCurrentView('home')} />;
  }

  async function runAction(action: 'signIn' | 'signOut' | 'users', operation: () => unknown) {
    if (isLoading || actionInProgress.current) return;
    actionInProgress.current = true;
    setPending(action);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作を完了できませんでした。');
    } finally {
      actionInProgress.current = false;
      setPending(null);
    }
  }

  const fetchUsers = () =>
    runAction('users', async () => {
      if (!user) return;
      const apiEndpoint = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:8000';
      const response = await fetch(`${apiEndpoint}/api/users`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!response.ok) throw new Error(`Error: ${response.status} ${response.statusText}`);
      setUsers(await response.json());
    });

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

      {error && (
        <p className="feedback feedback--error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="feedback feedback--busy" role="status">
          {pending === 'users' ? 'ユーザー一覧を取得中...' : '認証処理中...'}
        </p>
      )}
      {!user ? (
        <section className="panel">
          <p>
            ログイン、新規登録、またはパスワードを忘れた場合の再設定は、以下のボタンから AWS Cognito Managed Login
            画面へ進んでください。
          </p>
          <div className="landing-actions">
            <button
              className="button-primary"
              onClick={() => {
                void runAction('signIn', signIn);
              }}
              disabled={busy}
            >
              {busy ? '処理中...' : 'ログイン / 登録 / パスワード再設定 (Managed Login)'}
            </button>
            <button disabled={busy} onClick={() => setCurrentView('device-poc')}>
              メールアドレスでログイン（SRP）
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <p className="welcome">{user.email} でサインイン中</p>
            <div className="action-row">
              <button disabled={busy} onClick={() => setCurrentView('profile')}>
                プロフィール編集
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  void runAction('signOut', signOut);
                }}
              >
                サインアウト
              </button>
              <button disabled={busy} onClick={() => setCurrentView('mfa')}>
                MFA 設定
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>ユーザー一覧</h2>
            <button className="button-primary" disabled={busy} onClick={fetchUsers}>
              {pending === 'users' ? '取得中...' : 'ユーザー一覧を取得'}
            </button>
            {users.length > 0 && (
              <ul className="user-list">
                {users.map((u: any) => (
                  <li key={u.id}>
                    {u.email} ({u.status})
                  </li>
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
