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
  const [getModel] = useState(() => {
    const model = {
      registered: false,
      enabled: false,
      emailEnabled: false,
      preferred: undefined as string | undefined,
      emailVerified: true,
      challenge: 'TOTP' as string,
      remembered: false,
      signedIn: false,
    };
    return {
      get: () => model,
      signOut: () => {
        model.signedIn = false;
      },
    };
  });
  const model = getModel.get();
  const [mfa] = useState(() => {
    return createMfaService({
      async fetchMFAPreference() {
        return {
          enabled: [...(model.enabled ? ['TOTP'] : []), ...(model.emailEnabled ? ['EMAIL'] : [])],
          preferred: model.preferred,
        };
      },
      async setUpTOTP() {
        return {
          sharedSecret: 'JBSWY3DPEHPK3PXP',
          getSetupUri: () => new URL('otpauth://totp/Mock?secret=JBSWY3DPEHPK3PXP&issuer=Mock'),
        };
      },
      async verifyTOTPSetup({ code }) {
        if (code !== '123456') throw Object.assign(new Error('Mock mismatch'), { name: 'CodeMismatchException' });
        model.registered = true;
      },
      async updateMFAPreference(input) {
        if (input.totp && input.totp !== 'DISABLED' && !model.registered) {
          throw Object.assign(new Error('Mock unregistered'), { name: 'EnableSoftwareTokenMFAException' });
        }
        for (const [key, method] of [
          ['totp', 'TOTP'],
          ['email', 'EMAIL'],
        ] as const) {
          const value = input[key];
          if (!value) continue;
          if (key === 'totp') model.enabled = value !== 'DISABLED';
          else model.emailEnabled = value !== 'DISABLED';
          if (value === 'PREFERRED') model.preferred = method;
          else if (model.preferred === method && (value === 'NOT_PREFERRED' || value === 'DISABLED'))
            model.preferred = undefined;
        }
      },
      async fetchUserAttributes() {
        return { email: 'mock@example.com', email_verified: String(model.emailVerified) };
      },
      async sendUserAttributeVerificationCode() {},
      async confirmUserAttribute({ confirmationCode }) {
        if (confirmationCode !== '123456')
          throw Object.assign(new Error('Mock mismatch'), { name: 'CodeMismatchException' });
        model.emailVerified = true;
      },
    });
  });
  const [mockAttributes, setMockAttributes] = useState<Record<string, string>>({
    email: 'mock@example.com',
    email_verified: 'true',
    name: 'Mock User',
    phone_number: '+819012345678',
  });
  const [deviceAuth] = useState(() => {
    const mockSession = () => ({
      tokens: model.signedIn
        ? {
            accessToken: {
              payload: { device_key: 'mock-device', exp: Math.floor(Date.now() / 1000) + 3600 },
            },
            idToken: { payload: { exp: Math.floor(Date.now() / 1000) + 3600 } },
          }
        : undefined,
    });
    return createDeviceService({
      async signIn() {
        if (model.remembered || (!model.enabled && !model.emailEnabled)) {
          model.signedIn = true;
          return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
        }
        if (model.enabled && model.emailEnabled && !model.preferred) {
          model.challenge = 'selection';
          return {
            isSignedIn: false,
            nextStep: { signInStep: 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION', allowedMFATypes: ['TOTP', 'EMAIL'] },
          };
        }
        model.challenge = model.preferred ?? (model.emailEnabled ? 'EMAIL' : 'TOTP');
        return {
          isSignedIn: false,
          nextStep: {
            signInStep:
              model.challenge === 'EMAIL' ? 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE' : 'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
            codeDeliveryDetails: { destination: 'm***@e***' },
          },
        };
      },
      async confirmSignIn({ challengeResponse }) {
        if (model.challenge === 'selection') {
          if (!['TOTP', 'EMAIL'].includes(challengeResponse)) throw new Error('Unavailable method');
          model.challenge = challengeResponse;
          return {
            isSignedIn: false,
            nextStep: {
              signInStep:
                challengeResponse === 'EMAIL' ? 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE' : 'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
              codeDeliveryDetails: { destination: 'm***@e***' },
            },
          };
        }
        if (challengeResponse !== '123456')
          throw Object.assign(new Error('Mismatch'), { name: 'NotAuthorizedException' });
        model.signedIn = true;
        return { isSignedIn: true, nextStep: { signInStep: 'DONE' } };
      },
      async fetchMFAPreference() {
        return { enabled: [...(model.enabled ? ['TOTP'] : []), ...(model.emailEnabled ? ['EMAIL'] : [])] };
      },
      async fetchDevices() {
        return model.remembered
          ? [
              {
                id: 'mock-device',
                name: 'Mock device',
                attributes: {
                  device_status: 'valid',
                  'dev:device_remembered_status': 'remembered',
                },
              },
            ]
          : [];
      },
      async fetchAuthSession() {
        return mockSession();
      },
      async rememberDevice() {
        model.remembered = true;
      },
      async forgetDevice() {
        model.remembered = false;
      },
    });
  });
  const refreshUser = async () => {
    if (!user)
      setUser({
        username: 'mock_device_user',
        email: mockAttributes.email,
        token: 'dummy_mock_token',
      });
  };

  const signIn = () => {
    setIsLoading(true);
    // Simulate network delay
    setTimeout(() => {
      setUser({
        username: 'mock_user_123',
        email: mockAttributes.email,
        token: 'dummy_mock_token',
      });
      setIsLoading(false);
    }, 500);
  };

  const signOut = () => {
    getModel.signOut();
    setUser(null);
  };

  const getAttributes = async () => {
    return { ...mockAttributes };
  };

  const updateAttributes = async (attributes: Record<string, string>) => {
    setMockAttributes((prev) => ({ ...prev, ...attributes }));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        signIn,
        signOut,
        isLoading,
        getAttributes,
        updateAttributes,
        mfa,
        deviceAuth,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
