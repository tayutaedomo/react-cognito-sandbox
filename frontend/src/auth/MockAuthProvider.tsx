import React, { useState, ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from './AuthContext';

interface Props {
  children: ReactNode;
}

export function MockAuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mockAttributes, setMockAttributes] = useState<Record<string, string>>({
    email: 'mock@example.com',
    name: 'Mock User',
    phone_number: '+819012345678'
  });

  const signIn = () => {
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      setUser({
        username: 'mock_user_123',
        email: mockAttributes.email,
        token: 'dummy_mock_token'
      });
      setIsLoading(false);
    }, 500);
  };

  const signOut = () => {
    setUser(null);
  };

  const getAttributes = async () => {
    return { ...mockAttributes };
  };

  const updateAttributes = async (attributes: Record<string, string>) => {
    setMockAttributes(prev => ({ ...prev, ...attributes }));
  };

  return (
    <AuthContext.Provider value={{ 
      user, signIn, signOut, isLoading,
      getAttributes, updateAttributes
    }}>
      {children}
    </AuthContext.Provider>
  );
}
