import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';
import { AuthState, AuthTokens, User } from '@/types';

interface JwtPayload {
  exp: number;
  user_id: number;
  role?: string;
}

function isTokenAlive(token: string | null): boolean {
  if (!token) return false;
  try {
    const { exp } = jwtDecode<JwtPayload>(token);
    // Consider expired if less than 60 seconds remain
    return Date.now() < (exp - 60) * 1000;
  } catch {
    return false;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (tokens: AuthTokens) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', tokens.access);
          localStorage.setItem('refresh_token', tokens.refresh);
        }
        set({
          user: tokens.user,
          accessToken: tokens.access,
          refreshToken: tokens.refresh,
          isAuthenticated: true,
        });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      updateUser: (userData: Partial<User>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...userData } : null,
        }));
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

/** Returns true if the stored access token is present and not expired. */
export function useIsSessionValid(): boolean {
  const accessToken = useAuthStore((s) => s.accessToken);
  return isTokenAlive(accessToken);
}
