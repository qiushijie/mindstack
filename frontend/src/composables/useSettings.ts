import { ref, watch, nextTick } from 'vue'
import { LoadConfig, SaveConfig, SetLocale } from '../../wailsjs/go/main/App'
import { setLocale, type Locale } from '../i18n'

const autoSave = ref(true)
const autoSaveDelay = ref(5)
const locale = ref<Locale>('en')

let loaded = false
let skipWatch = false
let savePromise: Promise<void> | null = null
let needsSave = false

function parseDelay(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10)
  return isNaN(n) || n < 1 ? 5 : n
}

async function doSave() {
  if (savePromise) {
    needsSave = true
    return
  }

  savePromise = (async () => {
    while (true) {
      needsSave = false
      setLocale(locale.value)
      SetLocale(locale.value).catch(() => {})
      try {
        const raw = await LoadConfig()
        const config = JSON.parse(raw || '{}')
        config.settings = {
          autoSave: autoSave.value,
          autoSaveDelay: autoSaveDelay.value,
          locale: locale.value,
        }
        const result = await SaveConfig(JSON.stringify(config))
        if (result) {
          console.error('Failed to save settings:', result)
        }
      } catch (err) {
        console.error('Failed to save settings:', err)
      }
      if (!needsSave) break
    }
  })()

  await savePromise
  savePromise = null
}

export function useSettings() {
  async function loadSettings() {
    if (loaded) return
    skipWatch = true
    loaded = true
    try {
      const raw = await LoadConfig()
      const config = JSON.parse(raw || '{}')
      const s = config.settings || {}
      if (s.autoSave !== undefined) autoSave.value = s.autoSave
      if (s.autoSaveDelay !== undefined) autoSaveDelay.value = parseDelay(s.autoSaveDelay)
      if (s.locale) {
        locale.value = s.locale as Locale
        setLocale(locale.value)
        SetLocale(locale.value).catch(() => {})
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
    await nextTick()
    skipWatch = false
  }

  async function saveSettings() {
    await doSave()
  }

  return { autoSave, autoSaveDelay, locale, loadSettings, saveSettings }
}

watch([autoSave, autoSaveDelay, locale], async () => {
  if (!loaded || skipWatch) return
  await doSave()
})
