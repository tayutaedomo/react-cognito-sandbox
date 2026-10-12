import type { User } from './AuthContext';

interface CurrentUser {
  userId: string;
  signInDetails?: { loginId?: string };
}
interface Session {
  tokens?: { idToken?: { payload: Record<string, unknown>; toString(): string } };
}

export function sessionUser(current: CurrentUser, session: Session): User {
  const claim = session.tokens?.idToken?.payload.email;
  const email = typeof claim === 'string' && claim.trim() ? claim : (current.signInDetails?.loginId ?? '');
  return { username: current.userId, email, token: session.tokens?.idToken?.toString() ?? '' };
}
