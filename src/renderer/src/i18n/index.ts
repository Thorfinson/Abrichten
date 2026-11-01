import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './de.json'
import en from './en.json'

/** The UI language is an app preference (not part of the project file). */
const LANGUAGE_KEY = 'abrichten-language'

function storedLanguage(): 'de' | 'en' {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'de'
  } catch {
    return 'de'
  }
}

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en }
  },
  lng: storedLanguage(),
  fallbackLng: 'de',
  showSupportNotice: false,
  interpolation: {
    escapeValue: false
  }
})

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANGUAGE_KEY, lng)
  } catch { /* storage unavailable — the choice lasts for this session only */ }
})

export default i18n
