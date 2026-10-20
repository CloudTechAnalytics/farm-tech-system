import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1, refetchOnWindowFocus: false },
    // Mutations never auto-retry. A retry with the SAME idempotency key is safe,
    // but the user decides when to retry, with the form still filled in.
    mutations: { retry: 0 },
  },
})
