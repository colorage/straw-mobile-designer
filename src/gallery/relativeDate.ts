import { LOCALE_META } from '../i18n/locales'
import { useLocaleStore } from '../i18n/localeStore'
import { t } from '../i18n/t'

/** Compact "5m ago" / "3d ago" label for gallery and community cards. */
export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const deltaMs = Date.now() - then
  const minutes = Math.round(deltaMs / 60_000)
  if (minutes < 1) return t('date.justNow')
  if (minutes < 60) return t('date.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('date.hoursAgo', { count: hours })
  const days = Math.round(hours / 24)
  if (days < 14) return t('date.daysAgo', { count: days })
  const locale = useLocaleStore.getState().locale
  return new Date(iso).toLocaleDateString(LOCALE_META[locale].htmlLang)
}
