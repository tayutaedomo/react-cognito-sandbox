import { expect, it } from 'vitest';
import { sessionUser } from '../src/auth/sessionUser';

it('displays email from the ID token after Managed Login without signInDetails', () => {
  expect(
    sessionUser(
      { userId: 'user-1' },
      { tokens: { idToken: { payload: { email: 'managed@example.com' }, toString: () => 'token' } } },
    ),
  ).toEqual({ username: 'user-1', email: 'managed@example.com', token: 'token' });
});
it('prefers current token attributes over the login input', () => {
  expect(
    sessionUser(
      { userId: 'user-2', signInDetails: { loginId: 'old@example.com' } },
      { tokens: { idToken: { payload: { email: 'current@example.com' }, toString: () => 'token' } } },
    ).email,
  ).toBe('current@example.com');
});
it('uses SRP login details when email is absent or malformed in the token', () => {
  for (const email of [undefined, 42, '', ' '])
    expect(
      sessionUser(
        { userId: 'user-1', signInDetails: { loginId: 'srp@example.com' } },
        { tokens: { idToken: { payload: { email }, toString: () => 'token' } } },
      ).email,
    ).toBe('srp@example.com');
});
it('keeps the user identifier available without email or tokens', () => {
  expect(sessionUser({ userId: 'user-3' }, {})).toEqual({ username: 'user-3', email: '', token: '' });
});
