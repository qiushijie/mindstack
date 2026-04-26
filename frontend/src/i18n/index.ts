import { createI18n } from 'vue-i18n'
import en from './locales/en'
import zh from './locales/zh'
import ja from './locales/ja'
import fr from './locales/fr'
import de from './locales/de'
import es from './locales/es'
import ru from './locales/ru'
import ko from './locales/ko'

const messages = { en, zh, ja, fr, de, es, ru, ko }

export type Locale = 'en' | 'zh' | 'ja' | 'fr' | 'de' | 'es' | 'ru' | 'ko'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages,
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
}

export function getLocale(): Locale {
  return i18n.global.locale.value as Locale
}

export function t(key: string): string {
  return i18n.global.t(key) as string
}

export default i18n
