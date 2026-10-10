import { useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { User } from './AuthContext';
import { createMfaService } from './mfaService';
import { createDeviceService } from './deviceService';

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
  const [deviceAuth] = useState(() => {
    let remembered = false;
    let signedIn = false;
    const mockSession = () => ({ tokens: signedIn ? {
      accessToken: { payload: { device_key: remembered ? 'mock-device' : undefined, exp: Math.floor(Date.now() / 1000) + 3600 } },
      idToken: { payload: { exp: Math.floor(Date.now() / 1000) + 3600 } },
    } : undefined });
    return createDeviceService({
      async signIn() { return { isSignedIn: false, nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' } }; },
      async confirmSignIn({ challengeResponse }) {
        if (challengeResponse !== '123456') throw Object.assign(new Error('Mismatch'), { name: 'NotAuthorizedException' });
        signedIn = true;
        return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
      },
      async fetchMFAPreference() { return { enabled: ['TOTP'] }; },
      async fetchDevices() { return remembered ? [{ id: 'mock-device', name: 'Mock device' }] : []; },
      async fetchAuthSession() { return mockSession(); },
      async rememberDevice() { remembered = true; },
      async forgetDevice() { remembered = false; },
    });
  });
  const refreshUser = async () => {
    if (!user) setUser({ username: 'mock_device_user', email: mockAttributes.email, token: 'dummy_mock_token' });
  };

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
      getAttributes, updateAttributes, mfa, deviceAuth, refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}
