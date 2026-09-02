/**
 * Supabase Auth identifies password users by email, but this app never collects
 * one. Password accounts therefore use an address derived from the username on
 * a domain we control: it is never displayed and never receives mail (email
 * confirmation is disabled), and sign-in re-derives the same address.
 */
const SYNTHETIC_EMAIL_DOMAIN = 'users.spider.siaroza.com'

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

export const USERNAME_RULE_HINT = 'account.usernameHint'

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Returns null when valid, otherwise a catalog key safe to show in the form. */
export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw)
  if (!username) return 'auth.pickUsername'
  if (!USERNAME_PATTERN.test(username)) return USERNAME_RULE_HINT
  return null
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${SYNTHETIC_EMAIL_DOMAIN}`
}

/** True for the synthetic addresses above, which must never be shown to users. */
export function isSyntheticEmail(email: string | undefined): boolean {
  return Boolean(email?.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`))
}
