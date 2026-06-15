'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantSession {
  /** JWT Bearer token para autenticación en el backend Express */
  token: string;
  /** Identificador único del tenant / clínica en sesión */
  tenantId: string;
  /** Locale de la clínica para formateo de moneda y fechas */
  locale: string;
  /** Moneda base preferida del tenant */
  currency: string;
}

interface TenantContextValue {
  session: TenantSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Establece la sesión activa (llamado tras login exitoso) */
  setSession: (session: TenantSession) => void;
  /** Limpia la sesión (logout) */
  clearSession: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TenantContext = createContext<TenantContextValue | null>(null);

// ── Storage keys ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cfe_dental_session';

// ── Provider ──────────────────────────────────────────────────────────────────

export function TenantProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<TenantSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from sessionStorage on mount (client-only)
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as TenantSession;
        // Validate essential fields before trusting stored session
        if (parsed.token && parsed.tenantId) {
          setSessionState(parsed);
        }
      }
    } catch {
      // sessionStorage unavailable or malformed JSON — start clean
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setSession = useCallback((newSession: TenantSession) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
    setSessionState(newSession);
  }, []);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
  }, []);

  return (
    <TenantContext.Provider
      value={{
        session,
        isLoading,
        isAuthenticated: session !== null,
        setSession,
        clearSession,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error(
      'useTenant() must be used inside <TenantProvider>. ' +
      'Ensure frontend-dental/src/app/layout.tsx wraps children with <TenantProvider>.'
    );
  }
  return ctx;
}

/**
 * Convenience hook: returns the active session or throws if unauthenticated.
 * Use in pages/components that require a session to render.
 */
export function useRequiredSession(): TenantSession {
  const { session, isLoading } = useTenant();
  if (!isLoading && !session) {
    throw new Error(
      'No active session. Redirect to /login before rendering this component.'
    );
  }
  // During loading, return a safe empty-ish session to avoid crashes.
  // Pages must check isLoading from useTenant() to show skeletons.
  return session ?? { token: '', tenantId: '', locale: 'es-MX', currency: 'MXN' };
}
