"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSession,
  login as apiLogin,
  logout as apiLogout,
} from "@/lib/api/session";
import { ApiError } from "@/lib/api/transport";
import { keys } from "@/lib/query/keys";

/**
 * Authentication lives here, not in React state.
 *
 * The old provider kept `isAuthenticated` in `useState` and probed the server once, on mount, from
 * a `useEffect`. That had three consequences, all of them visible to the user:
 *
 *  1. **The answer was stale forever.** The session cookie has a server-side TTL. Leave the app
 *     open overnight and it is dead by morning, but the provider still believed it was signed in,
 *     so every screen showed "Couldn't reach the studio. Check your connection." — a network
 *     diagnosis for a session problem, with a Retry button that could only fail again.
 *  2. **`isLoading` meant two things.** It was true while the one-off probe was in flight *and*
 *     while a login request was in flight, so the keypad's spinner and disabled digits could
 *     appear before the user had touched anything.
 *  3. **Nothing shared the answer.** Every screen would have had to ask the same question itself,
 *     so none of them did.
 *
 * A React Query entry fixes all three with the tools that already exist here: one request, one
 * cache entry, and — critically — a 401 from *any* request marks the session anonymous through the
 * client's global error handler, so an expiry is noticed the moment the user touches the app
 * rather than on the next cold start.
 *
 * The cookie itself is `httpOnly` and stays invisible to JavaScript; this only ever holds the
 * server's yes/no. Authorisation is enforced by the backend on every request — nothing here is a
 * security boundary.
 */
export type SessionStatus =
  | "checking"
  | "authenticated"
  | "anonymous"
  /** The server could not be asked (offline). Neither answer is safe to assume. */
  | "unknown";

interface AuthContextValue {
  status: SessionStatus;
  /** True while a login request is in flight — the keypad's own loading state, nothing else. */
  isSigningIn: boolean;
  error: string | null;
  login: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && error.statusCode === 401;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const session = useQuery({
    queryKey: keys.session,
    /**
     * A 401 is the expected negative answer, so the value stored in the cache is the *answer*:
     * `true` for signed in, `null` for signed out (which is also what the client's global 401
     * handler writes). Storing the error state instead would make "signed out" and "never asked"
     * indistinguishable to every consumer.
     */
    queryFn: async ({ signal }) => {
      try {
        await getSession(signal);
        return true;
      } catch (err) {
        if (isUnauthorized(err)) return null;
        throw err;
      }
    },
    // Long enough that navigating between tabs does not re-ask, short enough that a session
    // revoked on another device is noticed within the minute.
    staleTime: 30_000,
    gcTime: Infinity,
  });

  const status: SessionStatus =
    session.data === true
      ? "authenticated"
      : session.data === null
        ? "anonymous"
        : session.isPending
          ? "checking"
          : "unknown";

  const login = useCallback(
    async (pin: string): Promise<boolean> => {
      setError(null);
      setIsSigningIn(true);

      try {
        await apiLogin({ pin });
        // The keypad is the only place the session can change without a refetch, so the answer is
        // written straight into the cache: the guard below sees it in the same commit and the
        // dashboard renders without waiting for a second round trip.
        queryClient.setQueryData(keys.session, true);
        setError(null);
        return true;
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Connection failed. Check your network.",
        );
        return false;
      } finally {
        setIsSigningIn(false);
      }
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // A logout that cannot reach the server still logs this device out: the cookie is cleared
      // for the next request to 401. Refusing to leave because the network is down would be worse.
    } finally {
      // Every cached row belongs to the session that is ending.
      queryClient.clear();
      queryClient.setQueryData(keys.session, null);
      router.replace("/login");
    }
  }, [queryClient, router]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ status, isSigningIn, error, login, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/customers"];

/**
 * One rule, one place: an expired session means the keypad.
 *
 * Without this the app had no answer for the expiry case at all — the user stayed on a screen
 * full of error banners with nothing to do but reload and hope. Here, the moment the session
 * flips to `anonymous` (whether from the probe or from a 401 on any other request) the app
 * navigates to `/login`.
 *
 * `checking` and `unknown` deliberately do nothing: redirecting a user whose phone has no signal
 * would be turning a temporary network problem into a forced re-login.
 */
export function SessionWatcher() {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onProtectedRoute = PROTECTED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    if (status === "anonymous" && onProtectedRoute) router.replace("/login");
    if (status === "authenticated" && pathname === "/login")
      router.replace("/dashboard");
  }, [status, pathname, router]);

  return null;
}
