import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface User {
  username: string;
  email: string;
  token: string;
}

export interface AuthContextType {
  user: User | null;
  signIn: () => void;
  signOut: () => void;
  isLoading: boolean;
  getAttributes: () => Promise<Record<string, string>>;
  updateAttributes: (attributes: Record<string, string>) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    raiseError('useAuth must be used within an AuthProvider');
  }
  return context;
}

function raiseError(message: string): never {
  throw new Error(message);
}
