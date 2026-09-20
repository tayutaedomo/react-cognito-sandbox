import React, { useEffect, useState, ReactNode } from 'react';
import { Amplify } from 'aws-amplify';
import { signInWithRedirect, signOut as amplifySignOut, getCurrentUser, fetchAuthSession, fetchUserAttributes, updateUserAttributes } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { AuthContext } from './AuthContext';
import type { User } from './AuthContext';

// Amplify の設定
// 本来は aws-exports.js や環境変数から読み込む
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || '',
          // スコープの定義:
          // - openid: ID トークン取得に必須
          // - email: メールアドレス属性へのアクセス
          // - profile: その他の標準属性 (name 等) へのアクセス
          // - aws.cognito.signin.user.admin: ユーザー自身による属性更新 API 等を呼び出すための権限
          scopes: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
          redirectSignIn: [window.location.origin],
          redirectSignOut: [window.location.origin],
          responseType: 'code'
        }
      }
    }
  }
});

export const AmplifyAuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 初回マウント時に現在のユーザーセッションを確認
    const checkUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        const session = await fetchAuthSession();
        
        setUser({
          username: currentUser.userId,
          email: currentUser.signInDetails?.loginId || '',
          token: session.tokens?.idToken?.toString() || ''
        });
      } catch (error) {
        // サインインしていない場合はエラーが飛んでくるので null のまま
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkUser();

    // Hosted UI からリダイレクトで戻ってきた後の状態変化を検知
    const unsubscribe = Hub.listen('auth', ({ payload }) => {
      switch (payload.event) {
        case 'signInWithRedirect':
          checkUser();
          break;
        case 'signedOut':
          setUser(null);
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    // Cognito Hosted UI へリダイレクト
    await signInWithRedirect();
  };

  const signOut = async () => {
    await amplifySignOut();
    setUser(null);
  };

  const getAttributes = async () => {
    const attrs = await fetchUserAttributes();
    return attrs as Record<string, string>;
  };

  const updateAttributes = async (attributes: Record<string, string>) => {
    await updateUserAttributes({ userAttributes: attributes });
  };

  return (
    <AuthContext.Provider value={{ 
      user, signIn, signOut, isLoading: loading,
      getAttributes, updateAttributes
    }}>
      {children}
    </AuthContext.Provider>
  );
};
