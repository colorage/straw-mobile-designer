import { useState } from 'react'
import { useAuthStore } from '../auth/authStore'
import { reloadAccountGallery, useMigrationStore } from '../gallery/accountSync'
import { useCloudSyncStore } from '../gallery/cloudSync'
import { useGalleryStore } from '../gallery/galleryStore'
import { useT, useTOrRaw } from '../i18n/t'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAccountPanelStore } from './accountPanelStore'

/** One-time prompt for users who arrived through Google and have no handle yet. */
function ClaimUsername() {
  const t = useT()
  const tRaw = useTOrRaw()
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
        <p className="account-notice-title">{t('account.pickUsernameTitle')}</p>
        <p className="account-notice-body">
          {t('account.pickUsernameBody', { hint: t('account.usernameHint') })}
        </p>
        {error && <p className="gallery-error account-error">{tRaw(error)}</p>}
      </div>
      <form className="account-notice-form" onSubmit={handleSubmit}>
        <input
          className="account-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={t('account.username')}
          spellCheck={false}
          maxLength={20}
        />
        <button type="submit" className="primary-button account-notice-button" disabled={busy}>
          {t('account.save')}
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
  const t = useT()
  const tRaw = useTOrRaw()
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
          <p className="account-notice-title">{t('account.browserOnlyTitle')}</p>
          <p className="account-notice-body">{t('account.browserOnlyBody')}</p>
        </div>
        <div className="account-notice-actions">
          <button
            type="button"
            className="primary-button account-notice-button"
            onClick={() => openPanel('signUp')}
          >
            {t('account.openAccount')}
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
              {t('account.movedMany', { count: movedCount })}
            </p>
            <p className="account-notice-body">
              {t('account.movedBody', {
                name: profile?.nickname?.trim() || t('account.yourAccountLower'),
              })}
            </p>
          </div>
          <button
            type="button"
            className="ghost-button account-notice-button"
            onClick={dismissMigration}
          >
            {t('account.gotIt')}
          </button>
        </div>
      )}

      {loadError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">{t('account.couldNotOpenGallery')}</p>
            <p className="account-notice-body">{tRaw(loadError)}</p>
          </div>
          <button
            type="button"
            className="ghost-button account-notice-button"
            onClick={reloadAccountGallery}
          >
            {t('account.retry')}
          </button>
        </div>
      )}

      {syncError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">{t('account.notSavedTitle')}</p>
            <p className="account-notice-body">{tRaw(syncError)}</p>
          </div>
        </div>
      )}

      {profileError && (
        <div className="account-notice account-notice-bad">
          <div className="account-notice-text">
            <p className="account-notice-title">{t('account.profileUnavailable')}</p>
            <p className="account-notice-body">{tRaw(profileError)}</p>
          </div>
        </div>
      )}
    </>
  )
}
