import React, { useState, ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from './AuthContext';

interface Props {
  children: ReactNode;
}

export function MockAuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const signIn = () => {
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      setUser({
        username: 'mock_user_123',
        email: 'mock@example.com',
        token: 'dummy_mock_token'
      });
      setIsLoading(false);
    }, 500);
  };

  const signOut = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}
