import { useState } from 'react'
import { useAuthStore } from '../auth/authStore'
import { USERNAME_RULE_HINT } from '../auth/username'
import { reloadAccountGallery, useMigrationStore } from '../gallery/accountSync'
import { useCloudSyncStore } from '../gallery/cloudSync'
import { useGalleryStore } from '../gallery/galleryStore'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAccountPanelStore } from './accountPanelStore'

/** One-time prompt for users who arrived through Google and have no handle yet. */
function ClaimUsername() {
  const claimUsername = useAuthStore((s) => s.claimUsername)
  const busy = useAuthStore((s) => s.busy)
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const result = await claimUsername(username)
    if (!result.ok) setError(result.message)
  }

  return (
    <div className="account-notice account-notice-action">
      <div className="account-notice-text">
        <p className="account-notice-title">Pick a username</p>
        <p className="account-notice-body">
          It is how you sign in later and cannot be changed. {USERNAME_RULE_HINT}
        </p>
        {error && <p className="gallery-error account-error">{error}</p>}
      </div>
      <form className="account-notice-form" onSubmit={handleSubmit}>
        <input
          className="account-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          spellCheck={false}
          maxLength={20}
        />
        <button type="submit" className="primary-button account-notice-button" disabled={busy}>
          Save
        </button>
      </form>
    </div>
  )
}

/**
 * Banners above the gallery grid: the guest sign-in suggestion, the result of
 * moving local mobiles into an account, and any account save problems.
 */
export function AccountNotices() {
  const ready = useAuthStore((s) => s.ready)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const profileError = useAuthStore((s) => s.profileError)
  const openPanel = useAccountPanelStore((s) => s.open)
  const movedCount = useMigrationStore((s) => s.movedCount)
  const dismissMigration = useMigrationStore((s) => s.dismiss)
  const syncError = useCloudSyncStore((s) => s.error)
  const loadError = useGalleryStore((s) => s.loadError)

  if (!isSupabaseConfigured || !ready) return null

  if (!user) {
    return (
      <div className="account-notice account-notice-action">
        <div className="account-notice-text">
          <p className="account-notice-title">These mobiles live in this browser only</p>
          <p className="account-notice-body">
            Clearing site data or switching devices loses them. Open the account menu to create a
            free account — username and password, no email.
          </p>
        </div>
        <div className="account-notice-actions">
          <button
            type="button"
            className="primary-button account-notice-button"
            onClick={() => openPanel('signUp')}
          >
            Open account
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {profile && !profile.username && <ClaimUsername />}

      {movedCount !== null && (
        <div className="account-notice account-notice-good">
          <div className="account-notice-text">
            <p className="account-notice-title">
              Moved {movedCount} {movedCount === 1 ? 'mobile' : 'mobiles'} into your account
            </p>
            <p className="account-notice-body">
              They are saved to <strong>{profile?.nickname ?? 'your account'}</strong> now and no
              longer kept in this browser.
            </p>
          </div>
          <button
            type="button"
            className="ghost-button account-notice-button"
            onClick={dismissMigration}
          >
            Got it
          </button>
        </div>
      )}

      {loadError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">Could not open your account gallery</p>
            <p className="account-notice-body">{loadError}</p>
          </div>
          <button
            type="button"
            className="ghost-button account-notice-button"
            onClick={reloadAccountGallery}
          >
            Retry
          </button>
        </div>
      )}

      {syncError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">Some changes are not saved</p>
            <p className="account-notice-body">{syncError}</p>
          </div>
        </div>
      )}

      {profileError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">Profile unavailable</p>
            <p className="account-notice-body">{profileError}</p>
          </div>
        </div>
      )}
    </>
  )
}
