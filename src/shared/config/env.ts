import { z } from 'zod'

/** Build-time environment, validated once. Only public values may appear here. */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  VITE_APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
  VITE_PRODUCT_NAME: z.string().min(1).optional(),
})

const parsed = schema.safeParse(import.meta.env)
const raw = parsed.success ? parsed.data : {}

export const env = {
  supabaseUrl: raw.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY ?? '',
  appEnv: raw.VITE_APP_ENV ?? (import.meta.env.PROD ? 'production' : 'development'),
  get isSupabaseConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey)
  },
} as const

export const PRODUCT = {
  name: raw.VITE_PRODUCT_NAME ?? 'FarmLedger',
  company: 'CloudTech Analytics',
  tagline: 'Farm records for poultry, fish and crops',
} as const
