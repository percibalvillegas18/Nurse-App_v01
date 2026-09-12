import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authApi } from '../api/client';
import { tokenStore } from '../auth/tokenStore';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    // Tokens live in memory only (see tokenStore.ts), so a page reload drops
    // the session. When a session is present, validate it against the backend.
    if (!tokenStore.hasSession()) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      // Validate token with backend
      const response = await authApi.me();
      const userData = response.data.data.user;
      setUser(userData);
    } catch (error) {
      // Token invalid, clear the in-memory session
      tokenStore.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    // Don't set global isLoading - let Login component handle its own loading state
    // Setting global isLoading causes PublicRoute to show full-screen spinner and hide form
    try {
      const response = await authApi.login(username, password);
      const { user: userData, tokens } = response.data.data;

      if (!userData || !tokens?.accessToken) {
        throw new Error('Invalid response from server - missing user or token');
      }

      tokenStore.setSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        sessionId: tokens.sessionId,
      });

      setUser(userData);
    } catch (error: any) {
      // Ensure error has response data for UI to show
      console.error('[AuthContext] Login failed:', error.response?.data || error.message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error', error);
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
