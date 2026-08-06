import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Publishable keys are meant to ship in browser bundles — they are visible in
 * any deployed build, and access control lives entirely in Row Level Security.
 * Defaulting them here keeps static GitHub Pages builds working without secret
 * wiring; the env vars exist so a fork can point at its own project.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://unhyfeawnzcpatyhemad.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'sb_publishable_mDxkx4Hc8PKfuJ2R4WeyUw_rm7zC4ty'

/** Accounts are optional: without config the app stays fully usable as a guest. */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Google returns to /gallery?code=..., exchanged client-side on load.
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/** Narrowing helper for the many call sites that need a configured client. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Accounts are unavailable: Supabase is not configured.')
  return supabase
}
