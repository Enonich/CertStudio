import { getSupabaseClient, initializeSupabaseClient } from './supabase';

/**
 * Authenticated fetch wrapper.
 * Automatically attaches the Supabase Bearer token to every request so the
 * FastAPI backend can verify the caller's identity.
 *
 * Drop-in replacement for the native `fetch` API.
 */
export async function apiFetch(url, options = {}) {
  // Ensure the client is fully initialized before reading the session, so
  // we never accidentally call getSession() on the placeholder client.
  await initializeSupabaseClient();
  const {
    data: { session },
  } = await getSupabaseClient().auth.getSession();

  const token = session?.access_token;

  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(url, { ...options, headers });
}
