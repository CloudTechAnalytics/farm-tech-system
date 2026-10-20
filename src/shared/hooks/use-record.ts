import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSubmissionKey } from '@/shared/hooks/use-submission-key'
import { toast } from '@/shared/components/ui/misc'

/** After any write, refresh everything derived from records. Reference lists keep their cache. */
export function invalidateRecords(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'ref' })
}

export function invalidateReference(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'ref' })
}

/**
 * Mutation for an idempotent database operation. The same submission key is
 * sent on every retry of the same form; it is renewed only after success.
 */
export function useRecord<TVars, TResult = unknown>(
  fn: (key: string, vars: TVars) => Promise<TResult>,
  opts: { success: string | ((result: TResult, vars: TVars) => string); onSuccess?: (result: TResult, vars: TVars) => void } ,
) {
  const qc = useQueryClient()
  const { key, renew } = useSubmissionKey()
  const mutation = useMutation({
    mutationFn: (vars: TVars) => fn(key, vars),
    onSuccess: async (result, vars) => {
      renew()
      const replayed = Boolean(result && typeof result === 'object' && (result as { replayed?: boolean }).replayed)
      const message = typeof opts.success === 'function' ? opts.success(result, vars) : opts.success
      if (replayed) toast.info('Already saved', { description: 'This entry was recorded earlier, so it was not added again.' })
      else toast.success(message)
      await invalidateRecords(qc)
      opts.onSuccess?.(result, vars)
    },
  })
  return { ...mutation, renewKey: renew }
}

/** Plain mutation (configuration edits) with toast and cache refresh. */
export function useSave<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success: string; reference?: boolean; onSuccess?: (result: TResult, vars: TVars) => void },
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result, vars) => {
      toast.success(opts.success)
      if (opts.reference) await invalidateReference(qc)
      await invalidateRecords(qc)
      opts.onSuccess?.(result, vars)
    },
  })
}
