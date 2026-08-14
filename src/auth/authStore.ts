import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { normalizeUsername, usernameToEmail, validateUsername } from './username'

export interface AuthProfile {
  id: string
  /** Null for Google-first users until they claim a handle. */
  username: string | null
  nickname: string
}

export type AuthResult = { ok: true } | { ok: false; message: string }

interface AuthState {
  /** False until the stored session (if any) has been resolved. */
  ready: boolean
  session: Session | null
  user: User | null
  profile: AuthProfile | null
  /** Set when the profile row could not be read — usually the schema is missing. */
  profileError: string | null
  busy: boolean

  signUp: (username: string, password: string, nickname: string) => Promise<AuthResult>
  signIn: (username: string, password: string) => Promise<AuthResult>
  signInWithGoogle: () => Promise<AuthResult>
  linkGoogle: () => Promise<AuthResult>
  signOut: () => Promise<void>
  /** Permanently deletes the auth user (and cascaded cloud data) via RPC. */
  deleteAccount: () => Promise<AuthResult>
  setNickname: (nickname: string) => Promise<AuthResult>
  claimUsername: (username: string) => Promise<AuthResult>
}

function ok(): AuthResult {
  return { ok: true }
}

function fail(message: string): AuthResult {
  return { ok: false, message }
}

/** Supabase surfaces raw provider errors; translate the ones users can hit. */
function describeAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) {
    return 'auth.badCredentials'
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'auth.usernameTaken'
  }
  if (lower.includes('email logins are disabled') || lower.includes('email signups are disabled')) {
    return 'auth.emailDisabled'
  }
  if (lower.includes('signups not allowed')) {
    return 'auth.signupsOff'
  }
  if (lower.includes('password')) return message
  if (lower.includes('manual linking is disabled')) {
    return 'auth.googleLinkDisabled'
  }
  if (lower.includes('identity is already linked')) {
    return 'auth.googleAlreadyLinked'
  }
  return message
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return describeAuthError(error.message)
  return fallback
}

/** OAuth returns here; the gallery is where accounts are managed. */
function oauthRedirectUrl(): string {
  return `${window.location.origin}/gallery`
}

function nicknameFromUser(user: User): string {
  const meta = user.user_metadata ?? {}
  const candidates = [meta.nickname, meta.full_name, meta.name, meta.username]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return 'Builder'
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  ready: !isSupabaseConfigured,
  session: null,
  user: null,
  profile: null,
  profileError: null,
  busy: false,

  signUp: async (username, password, nickname) => {
    if (!supabase) return fail('auth.unavailable')
    const invalid = validateUsername(username)
    if (invalid) return fail(invalid)
    const handle = normalizeUsername(username)
    const displayName = nickname.trim() || handle

    set({ busy: true })
    try {
      const { data, error } = await supabase.auth.signUp({
        email: usernameToEmail(handle),
        password,
        options: { data: { username: handle, nickname: displayName } },
      })
      if (error) return fail(describeAuthError(error.message))
      if (!data.session) {
        return fail('auth.confirmEmail')
      }
      return ok()
    } catch (error) {
      return fail(toMessage(error, 'auth.couldNotCreate'))
    } finally {
      set({ busy: false })
    }
  },

  signIn: async (username, password) => {
    if (!supabase) return fail('auth.unavailable')
    const handle = normalizeUsername(username)
    if (!handle) return fail('auth.enterUsername')

    set({ busy: true })
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(handle),
        password,
      })
      if (error) return fail(describeAuthError(error.message))
      return ok()
    } catch (error) {
      return fail(toMessage(error, 'auth.couldNotSignIn'))
    } finally {
      set({ busy: false })
    }
  },

  signInWithGoogle: async () => {
    if (!supabase) return fail('auth.unavailable')
    set({ busy: true })
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: oauthRedirectUrl() },
      })
      if (error) {
        set({ busy: false })
        return fail(describeAuthError(error.message))
      }
      // The browser is navigating to Google; stay busy so the form does not flicker.
      return ok()
    } catch (error) {
      set({ busy: false })
      return fail(toMessage(error, 'auth.couldNotGoogle'))
    }
  },

  linkGoogle: async () => {
    if (!supabase) return fail('auth.unavailable')
    set({ busy: true })
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: oauthRedirectUrl() },
      })
      if (error) {
        set({ busy: false })
        return fail(describeAuthError(error.message))
      }
      return ok()
    } catch (error) {
      set({ busy: false })
      return fail(toMessage(error, 'auth.couldNotConnectGoogle'))
    }
  },

  signOut: async () => {
    if (!supabase) return
    set({ busy: true })
    try {
      await supabase.auth.signOut()
    } finally {
      set({ busy: false })
    }
  },

  deleteAccount: async () => {
    if (!supabase) return fail('auth.unavailable')
    set({ busy: true })
    try {
      const { error } = await supabase.rpc('delete_own_account')
      if (error) {
        return fail(
          describeAuthError(error.message) || 'auth.couldNotDelete',
        )
      }
      // The auth user is gone; clear the local session without calling the server.
      await supabase.auth.signOut({ scope: 'local' })
      return ok()
    } catch (error) {
      return fail(toMessage(error, 'auth.couldNotDelete'))
    } finally {
      set({ busy: false })
    }
  },

  setNickname: async (nickname) => {
    const { profile } = get()
    if (!supabase || !profile) return fail('auth.signInToNickname')
    const trimmed = nickname.trim()
    if (!trimmed) return fail('auth.nicknameEmpty')
    if (trimmed.length > 40) return fail('auth.nicknameTooLong')
    if (trimmed === profile.nickname) return ok()

    const previous = profile
    set({ profile: { ...profile, nickname: trimmed } })
    const { error } = await supabase
      .from('profiles')
      .update({ nickname: trimmed })
      .eq('id', profile.id)
    if (error) {
      set({ profile: previous })
      return fail('auth.couldNotSaveNickname')
    }
    return ok()
  },

  claimUsername: async (username) => {
    const { profile } = get()
    if (!supabase || !profile) return fail('auth.signInFirst')
    if (profile.username) return fail('auth.usernameAlreadySet')
    const invalid = validateUsername(username)
    if (invalid) return fail(invalid)
    const handle = normalizeUsername(username)

    set({ busy: true })
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username: handle })
        .eq('id', profile.id)
      // 23505: unique violation on profiles.username.
      if (error?.code === '23505') return fail('auth.usernameTaken')
      if (error) return fail('auth.couldNotSaveUsername')
      set({ profile: { ...profile, username: handle } })
      return ok()
    } finally {
      set({ busy: false })
    }
  },
}))

/**
 * Read the profile row, creating it when missing. The database trigger normally
 * makes it during signup; self-healing covers users created before the schema
 * was applied.
 */
async function loadProfile(user: User): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nickname')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    useAuthStore.setState({
      profile: null,
      profileError: 'auth.profileLoadFailed',
    })
    return
  }

  if (data) {
    useAuthStore.setState({
      profile: {
        id: data.id as string,
        username: (data.username as string | null) ?? null,
        nickname: (data.nickname as string) || nicknameFromUser(user),
      },
      profileError: null,
    })
    return
  }

  const seeded = {
    id: user.id,
    username: (user.user_metadata?.username as string | undefined) ?? null,
    nickname: nicknameFromUser(user),
  }
  const { error: insertError } = await supabase.from('profiles').insert(seeded)
  if (insertError) {
    useAuthStore.setState({
      profile: { ...seeded, username: null },
      profileError: 'auth.profileCreateFailed',
    })
    return
  }
  useAuthStore.setState({ profile: seeded, profileError: null })
}

function applySession(session: Session | null): void {
  const user = session?.user ?? null
  const previousUserId = useAuthStore.getState().user?.id ?? null
  useAuthStore.setState({ session, user, ready: true })

  if (!user) {
    useAuthStore.setState({ profile: null, profileError: null })
    return
  }
  if (user.id !== previousUserId || !useAuthStore.getState().profile) {
    void loadProfile(user)
  }
}

if (supabase) {
  void supabase.auth
    .getSession()
    .then(({ data }) => applySession(data.session))
    .catch(() => useAuthStore.setState({ ready: true }))

  supabase.auth.onAuthStateChange((_event, session) => {
    applySession(session)
  })
}
