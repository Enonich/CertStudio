import { createClient } from '@supabase/supabase-js';

const placeholderUrl = 'https://placeholder.supabase.co';
const placeholderKey = 'placeholder-anon-key';

let supabase = createClient(placeholderUrl, placeholderKey);
let initialized = false;
let initializePromise = null;

function getBuildTimeConfig() {
  return {
    url: import.meta.env.SUPABASE_URL || '',
    anonKey: import.meta.env.SUPABASE_ANON_KEY || '',
  };
}

async function getRuntimeConfig() {
  try {
    const response = await fetch('/api/runtime-config', { cache: 'no-store' });
    if (!response.ok) return { url: '', anonKey: '' };
    const data = await response.json();
    return {
      url: data?.supabase_url || '',
      anonKey: data?.supabase_anon_key || '',
    };
  } catch {
    return { url: '', anonKey: '' };
  }
}

export async function initializeSupabaseClient() {
  if (initialized) return supabase;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const buildConfig = getBuildTimeConfig();
    let url = buildConfig.url;
    let anonKey = buildConfig.anonKey;

    if (!url || !anonKey) {
      const runtimeConfig = await getRuntimeConfig();
      url = url || runtimeConfig.url;
      anonKey = anonKey || runtimeConfig.anonKey;
    }

    if (!url || !anonKey) {
      console.error(
        '[CertStudio] Missing Supabase config. Set SUPABASE_URL and SUPABASE_ANON_KEY in root .env for local use, ' +
        'and as Hugging Face Space secrets for Docker runtime.'
      );
      initialized = true;
      return supabase;
    }

    supabase = createClient(url, anonKey);
    initialized = true;
    return supabase;
  })();

  return initializePromise;
}

export function getSupabaseClient() {
  return supabase;
}

export { supabase };
