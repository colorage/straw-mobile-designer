/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL; community features are hidden when absent. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase publishable (anon) key; community features are hidden when absent. */
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
