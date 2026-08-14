import { useCallback } from 'react'
import { catalogs } from './messages'
import { LOCALE_META, type Locale } from './locales'
import { useLocaleStore } from './localeStore'
import { en, type MessageKey, type PluralForms } from './messages/en'

export type { MessageKey, Messages, PluralForms } from './messages/en'
export type TranslateVars = Record<string, string | number>

const MESSAGE_KEYS = new Set<string>(Object.keys(en))

const pluralRulesCache = new Map<Locale, Intl.PluralRules>()

function getPluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(LOCALE_META[locale].htmlLang)
    pluralRulesCache.set(locale, rules)
  }
  return rules
}

function interpolate(template: string, vars: TranslateVars | undefined): string {
  if (!vars) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] === undefined ? '' : String(vars[name]),
  )
}

function resolveTemplate(value: string | PluralForms, vars: TranslateVars | undefined, locale: Locale): string {
  if (typeof value === 'string') return value
  const count = Number(vars?.count ?? 0)
  const rule = getPluralRules(locale).select(Number.isFinite(count) ? count : 0)
  if (rule === 'one' && value.one) return value.one
  if (rule === 'few' && value.few) return value.few
  if (rule === 'many' && value.many) return value.many
  return value.other
}

export function isMessageKey(value: string): value is MessageKey {
  return MESSAGE_KEYS.has(value)
}

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const value = catalogs[locale][key] ?? catalogs.en[key]
  return interpolate(resolveTemplate(value, vars, locale), vars)
}

/** Translate a catalog key using the persisted locale. Safe to call outside React. */
export function t(key: MessageKey, vars?: TranslateVars): string {
  return translate(useLocaleStore.getState().locale, key, vars)
}

/** Translate when `value` is a catalog key; otherwise return it unchanged (e.g. Supabase text). */
export function tOrRaw(value: string, vars?: TranslateVars): string {
  if (isMessageKey(value)) return t(value, vars)
  return value
}

/** Hook that re-renders when the locale changes. */
export function useT(): (key: MessageKey, vars?: TranslateVars) => string {
  const locale = useLocaleStore((s) => s.locale)
  return useCallback((key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars), [locale])
}

export function useTOrRaw(): (value: string, vars?: TranslateVars) => string {
  const locale = useLocaleStore((s) => s.locale)
  return useCallback((value: string, vars?: TranslateVars) => {
    if (isMessageKey(value)) return translate(locale, value, vars)
    return value
  }, [locale])
}
