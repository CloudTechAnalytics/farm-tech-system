import * as React from 'react'

/**
 * One idempotency key per form submission. The key stays the same while the
 * user retries a failed save, so the database applies it at most once, and is
 * renewed only after a successful save or when the form is reopened.
 */
export function useSubmissionKey() {
  const [key, setKey] = React.useState(() => crypto.randomUUID())
  const renew = React.useCallback(() => setKey(crypto.randomUUID()), [])
  return { key, renew }
}
