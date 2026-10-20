import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { ApiError, get, post, setUnauthenticatedHandler } from './api';
import type { Me } from './types';

export type MfaMethods = { totp: boolean; email: boolean };
export type SignInResult = { status: 'ok'; user: Me } | { status: 'mfa'; challenge: string; methods: MfaMethods; emailHint?: string };

type AuthState = {
  user: Me | null;
  loading: boolean;
  twoFactorRequired: boolean;
  can: (capability: string) => boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  verifyMfa: (challenge: string, code: string) => Promise<Me>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user, twoFactorRequired } = await get<{ user: Me; twoFactorRequired?: boolean }>('/api/auth/me');
        return { user, twoFactorRequired: Boolean(twoFactorRequired) };
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return { user: null, twoFactorRequired: false };
        throw error;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Any 401 from a data request means the session ended (expired, revoked,
  // password changed elsewhere): drop to the sign-in screen.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      queryClient.setQueryData(['me'], { user: null, twoFactorRequired: false });
    });
  }, [queryClient]);

  // Drop every cached response except the signed-in user. clear() would also
  // detach the live ['me'] query from the component watching it, leaving the
  // app showing the previous user (or none) until a full reload.
  const resetCache = useCallback(
    (user: Me | null, twoFactorRequired = false) => {
      queryClient.setQueryData(['me'], { user, twoFactorRequired });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const res = await post<{ user?: Me; mfaRequired?: boolean; challenge?: string; methods?: MfaMethods; emailHint?: string; twoFactorRequired?: boolean }>('/api/auth/login', { email, password });
      if (res.mfaRequired && res.challenge) return { status: 'mfa', challenge: res.challenge, methods: res.methods ?? { totp: true, email: false }, emailHint: res.emailHint };
      resetCache(res.user!, res.twoFactorRequired);
      return { status: 'ok', user: res.user! };
    },
    [resetCache],
  );

  const verifyMfa = useCallback(
    async (challenge: string, code: string): Promise<Me> => {
      const { user, twoFactorRequired } = await post<{ user: Me; twoFactorRequired?: boolean }>('/api/auth/login/totp', { challenge, code });
      resetCache(user, Boolean(twoFactorRequired));
      return user;
    },
    [resetCache],
  );

  const signOut = useCallback(async () => {
    await post('/api/auth/logout').catch(() => undefined);
    resetCache(null);
  }, [resetCache]);

  const user = me.data?.user ?? null;
  const value: AuthState = {
    user,
    loading: me.isLoading,
    twoFactorRequired: Boolean(me.data?.twoFactorRequired),
    can: (capability) => Boolean(user?.capabilities.includes(capability)),
    signIn,
    verifyMfa,
    signOut,
    refresh: async () => {
      await me.refetch();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export const roleLabel: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  EDITOR: 'Editor',
  AUTHOR: 'Author',
};
