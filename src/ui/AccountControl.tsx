import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../auth/authStore'
import { USERNAME_RULE_HINT } from '../auth/username'
import { flushCloudSync } from '../gallery/cloudSync'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAccountPanelStore } from './accountPanelStore'

function useDismissOnEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])
}

/** Sign-in / create-account form, including the Google option. */
function AuthForm({ mode, onSwitchMode }: { mode: 'signIn' | 'signUp'; onSwitchMode: () => void }) {
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle)
  const busy = useAuthStore((s) => s.busy)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [mode])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const result =
      mode === 'signIn'
        ? await signIn(username, password)
        : await signUp(username, password, nickname)
    if (!result.ok) setError(result.message)
  }

  const handleGoogle = async () => {
    setError(null)
    const result = await signInWithGoogle()
    if (!result.ok) setError(result.message)
  }

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <label className="account-field">
        <span className="account-field-label">Username</span>
        <input
          ref={usernameRef}
          className="account-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          spellCheck={false}
          maxLength={20}
        />
      </label>

      <label className="account-field">
        <span className="account-field-label">Password</span>
        <input
          className="account-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        />
      </label>

      {mode === 'signUp' && (
        <>
          <label className="account-field">
            <span className="account-field-label">Nickname</span>
            <input
              className="account-input"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={username || 'Shown in your gallery'}
              maxLength={40}
            />
          </label>
          <p className="account-hint">{USERNAME_RULE_HINT} No email needed.</p>
        </>
      )}

      {error && <p className="gallery-error account-error">{error}</p>}

      <button type="submit" className="primary-button account-submit" disabled={busy}>
        {mode === 'signIn' ? 'Sign in' : 'Create account'}
      </button>

      <div className="account-divider">
        <span>or</span>
      </div>

      <button type="button" className="ghost-button" onClick={handleGoogle} disabled={busy}>
        Continue with Google
      </button>

      <p className="account-hint account-switch">
        {mode === 'signIn' ? 'No account yet?' : 'Already have an account?'}{' '}
        <button type="button" className="account-link" onClick={onSwitchMode}>
          {mode === 'signIn' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </form>
  )
}

/** Nickname, username, connected providers, and sign-out for the current user. */
function ProfileForm({ onClose }: { onClose: () => void }) {
  const profile = useAuthStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const busy = useAuthStore((s) => s.busy)
  const setNickname = useAuthStore((s) => s.setNickname)
  const linkGoogle = useAuthStore((s) => s.linkGoogle)
  const signOut = useAuthStore((s) => s.signOut)
  const [draftNickname, setDraftNickname] = useState(profile?.nickname ?? '')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraftNickname(profile?.nickname ?? '')
  }, [profile?.nickname])

  const googleLinked = user?.identities?.some((identity) => identity.provider === 'google') ?? false

  const handleSaveNickname = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setStatus(null)
    const result = await setNickname(draftNickname)
    if (result.ok) setStatus('Nickname saved.')
    else setError(result.message)
  }

  const handleLinkGoogle = async () => {
    setError(null)
    const result = await linkGoogle()
    if (!result.ok) setError(result.message)
  }

  const handleSignOut = async () => {
    // Push anything still queued before the session (and its access) goes away.
    await flushCloudSync()
    await signOut()
    onClose()
  }

  return (
    <div className="account-form">
      <form onSubmit={handleSaveNickname}>
        <label className="account-field">
          <span className="account-field-label">Nickname</span>
          <input
            className="account-input"
            value={draftNickname}
            onChange={(event) => setDraftNickname(event.target.value)}
            maxLength={40}
          />
        </label>
        <button type="submit" className="primary-button account-submit" disabled={busy}>
          Save nickname
        </button>
      </form>

      <p className="account-hint">
        Username <strong>@{profile?.username ?? '—'}</strong> — permanent, used to sign in.
      </p>

      {status && <p className="account-hint account-status">{status}</p>}
      {error && <p className="gallery-error account-error">{error}</p>}

      {googleLinked ? (
        <p className="account-hint">Google is connected.</p>
      ) : (
        <button type="button" className="ghost-button" onClick={handleLinkGoogle} disabled={busy}>
          Connect Google
        </button>
      )}

      <button
        type="button"
        className="ghost-button account-signout"
        onClick={handleSignOut}
        disabled={busy}
      >
        Log out
      </button>
    </div>
  )
}

/** Header control: opens sign-in for guests, the profile panel when signed in. */
export function AccountControl() {
  const ready = useAuthStore((s) => s.ready)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const panel = useAccountPanelStore((s) => s.panel)
  const open = useAccountPanelStore((s) => s.open)
  const close = useAccountPanelStore((s) => s.close)

  useDismissOnEscape(panel !== 'none', close)

  // Close the sign-in form once the session lands (including on OAuth return).
  useEffect(() => {
    if (user && (panel === 'signIn' || panel === 'signUp')) close()
    if (!user && panel === 'profile') close()
  }, [user, panel, close])

  if (!isSupabaseConfigured) return null
  if (!ready) return <span className="account-trigger account-trigger-idle">…</span>

  const signedIn = Boolean(user)
  const label = signedIn ? (profile?.nickname ?? 'Account') : 'Sign in'

  return (
    <>
      <button
        type="button"
        className="ghost-button gallery-page-action account-trigger"
        onClick={() => open(signedIn ? 'profile' : 'signIn')}
      >
        {label}
      </button>

      {panel !== 'none' && (
        <div
          className="account-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div className="account-dialog" role="dialog" aria-modal="true" aria-label={label}>
            <div className="account-dialog-head">
              <h2 className="account-dialog-title">
                {panel === 'profile'
                  ? 'Your account'
                  : panel === 'signUp'
                    ? 'Create an account'
                    : 'Sign in'}
              </h2>
              <button
                type="button"
                className="account-close"
                onClick={close}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {panel === 'profile' ? (
              <ProfileForm onClose={close} />
            ) : (
              <AuthForm
                mode={panel === 'signUp' ? 'signUp' : 'signIn'}
                onSwitchMode={() => open(panel === 'signUp' ? 'signIn' : 'signUp')}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
