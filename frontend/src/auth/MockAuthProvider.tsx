import { useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from './AuthContext';
import { createMfaService } from './mfaService';

interface Props {
  children: ReactNode;
}

export function MockAuthProvider({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mfa] = useState(() => {
    let registered = false;
    let enabled = false;
    return createMfaService({
      async fetchMFAPreference() { return { enabled: enabled ? ['TOTP'] : [], preferred: enabled ? 'TOTP' : undefined }; },
      async setUpTOTP() {
        return { sharedSecret: 'JBSWY3DPEHPK3PXP', getSetupUri: () => new URL('otpauth://totp/Mock?secret=JBSWY3DPEHPK3PXP&issuer=Mock') };
      },
      async verifyTOTPSetup({ code }) {
        if (code !== '123456') throw Object.assign(new Error('Mock mismatch'), { name: 'CodeMismatchException' });
        registered = true;
      },
      async updateMFAPreference({ totp }) {
        if (totp === 'PREFERRED' && !registered) throw Object.assign(new Error('Mock unregistered'), { name: 'EnableSoftwareTokenMFAException' });
        enabled = totp === 'PREFERRED';
      },
    });
  });
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
      getAttributes, updateAttributes, mfa
    }}>
      {children}
    </AuthContext.Provider>
  );
}
