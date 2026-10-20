import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.generated'
import { env } from '@/shared/config/env'

// Browsers put no timeout on fetch(). A stalled connection would otherwise
// hang every query built on top of it, so every Supabase request is bounded
// here, in one place (pattern carried over from The Counsel).
const FETCH_TIMEOUT_MS = 20_000

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  if (init.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

/**
 * The one Supabase client. Postgres, Auth and Storage are all reached through
 * it; Row Level Security enforces tenant isolation on every request. Without
 * credentials it points at a placeholder so the UI can show a setup notice.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'public-anon-key-not-configured',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
    global: { fetch: fetchWithTimeout },
  },
)
