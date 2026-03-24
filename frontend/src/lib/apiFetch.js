import { supabase } from './supabase';

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the Supabase Bearer token to every request so the
 * FastAPI backend can verify the caller's identity.
 *
 * Drop-in replacement for the native `fetch` API.
 */
export async function apiFetch(url, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token;

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(url, { ...options, headers });
}
