import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Community features (publish, browse, like) need a configured Supabase
 * project. Without env vars the app still works fully offline/local.
 */
export const isCommunityEnabled = Boolean(supabaseUrl && supabaseAnonKey)

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Community features are not configured.')
  }
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }
  return client
}

let signInPromise: Promise<string> | null = null

/**
 * Return the current user id, signing in anonymously on first use.
 * The anonymous session persists in localStorage, so each browser keeps a
 * stable identity for "my published projects" and "one like per user".
 * Only call from user actions (publish / like) so plain visitors never
 * create auth users.
 */
export async function ensureAnonymousUser(): Promise<string> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session.user.id

  signInPromise ??= supabase.auth
    .signInAnonymously()
    .then(({ data: signIn, error }) => {
      if (error || !signIn.user) {
        throw new Error(error?.message ?? 'Could not create an anonymous session.')
      }
      return signIn.user.id
    })
    .finally(() => {
      signInPromise = null
    })
  return signInPromise
}

/** Current user id when a session already exists; null otherwise (no sign-in). */
export async function getCurrentUserId(): Promise<string | null> {
  if (!isCommunityEnabled) return null
  const { data } = await getSupabase().auth.getSession()
  return data.session?.user.id ?? null
}
