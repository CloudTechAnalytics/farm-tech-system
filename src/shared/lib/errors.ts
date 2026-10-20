/**
 * Supabase and PostgREST errors are plain objects, not Error instances, so
 * `err instanceof Error ? err.message : …` silently drops their message.
 */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) return String((err as { code: unknown }).code)
  return undefined
}

/**
 * Message suitable for a toast or form error. The database raises plain-English
 * messages for business rules; internal wording (RLS, constraint names, network
 * aborts) is translated here.
 */
export function friendlyError(err: unknown, fallback?: string): string {
  const raw = errorMessage(err, fallback)
  const code = errorCode(err)
  const lower = raw.toLowerCase()
  if (lower.includes('row-level security') || code === '42501' && lower.includes('permission denied for')) {
    return "You don't have permission to do this, or the record is outside the sites you can access."
  }
  if (lower.includes('aborted') || lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Could not reach the server. Check your connection and try again. Nothing was saved twice.'
  }
  if (code === '23505') {
    if (lower.includes('code')) return 'That code is already in use. Choose another.'
    if (lower.includes('name')) return 'That name is already in use. Choose another.'
    return 'A record with these details already exists.'
  }
  if (code === '23503') return 'A linked record could not be found. Refresh the page and try again.'
  if (lower.includes('jwt') && lower.includes('expired')) return 'Your session has expired. Sign in again.'
  return raw
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'The request timed out.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}
