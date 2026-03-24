import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSupabaseClient, initializeSupabaseClient } from '../lib/supabase';

const AuthContext = createContext(null);

/**
 * Provides Supabase auth state and helpers to the entire React tree.
 * `session` is `undefined` while the initial session is being loaded,
 * `null` when not logged in, or the Supabase session object when authenticated.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const clientRef = useRef(getSupabaseClient());

  useEffect(() => {
    let active = true;
    let subscription;
    let fallbackTimer;

    const finalizeSession = (nextSession) => {
      if (!active) return;
      clearTimeout(fallbackTimer); // cancel the fallback if real auth responded first
      setSession(nextSession ?? null);
    };

    fallbackTimer = setTimeout(() => {
      setSession((prev) => (prev === undefined ? null : prev));
    }, 4000);

    (async () => {
      try {
        const client = await initializeSupabaseClient();
        clientRef.current = client;

        const { data, error } = await client.auth.getSession();
        if (error) {
          console.warn('[CertStudio] Supabase getSession() failed:', error.message);
        }
        finalizeSession(data?.session ?? null);

        const authListener = client.auth.onAuthStateChange((_event, nextSession) => {
          finalizeSession(nextSession);
        });
        subscription = authListener?.data?.subscription;
      } catch (error) {
        console.error('[CertStudio] Failed to initialize auth session:', error);
        finalizeSession(null);
      }
    })();

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      subscription?.unsubscribe();
    };
  }, []);

  const getReadyClient = async () => {
    if (!clientRef.current) {
      clientRef.current = await initializeSupabaseClient();
    }
    return clientRef.current;
  };

  const signIn = async (email, password) => {
    const client = await getReadyClient();
    return client.auth.signInWithPassword({ email, password });
  };

  const signUp = async (email, password) => {
    const client = await getReadyClient();
    return client.auth.signUp({ email, password });
  };

  const signOut = async () => {
    const client = await getReadyClient();
    return client.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
