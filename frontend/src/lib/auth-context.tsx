"use client";

/**
 * Authentication Context
 *
 * The backend uses httpOnly cookies for session management. We don't store
 * tokens in JavaScript — the browser sends them automatically with requests
 * (via `credentials: "include"`).
 *
 * Mounted ONCE at the root layout, so the session check runs a single time
 * per app load (not on every tab switch). The login page owns the
 * authenticated → /dashboard redirect (it flips `isAuthenticated`).
 *
 * This context provides:
 * - A way to check if the user is authenticated (via the session-check read)
 * - Login/logout functions that call the backend
 * - Loading/error states for auth operations
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { checkSession as apiCheckSession, login as apiLogin, logout as apiLogout, ApiError } from "./api-client";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if the user has an active session on mount (once, at the root).
  useEffect(() => {
    async function checkActiveSession() {
      try {
        // Reuse the Axios client so auth checks and dashboard queries share the
        // same cookie policy and error normalization.
        await apiCheckSession();
        setIsAuthenticated(true);
      } catch {
        // Not authenticated — stay where we are
      } finally {
        setIsLoading(false);
      }
    }

    checkActiveSession();
  }, []);

  const login = useCallback(async (pin: string): Promise<boolean> => {
    setError(null);
    setIsLoading(true);

    try {
      await apiLogin({ pin });
      setIsAuthenticated(true);
      // Redirect to dashboard after successful login
      window.location.href = "/dashboard";
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Connection failed. Check your network.");
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setIsAuthenticated(false);
      // Redirect to login after logout
      window.location.href = "/login";
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
