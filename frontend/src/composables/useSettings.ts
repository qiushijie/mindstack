import { ref, watch, nextTick } from 'vue'
import { LoadConfig, SaveConfig, SetLocale, ReloadLLM, GetPlatform } from '../../wailsjs/go/main/App'
import { WindowSetLightTheme, WindowSetDarkTheme } from '../../wailsjs/runtime/runtime'
import { setLocale, type Locale } from '../i18n'

export const SUPPORTED_MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
] as const

export type SupportedModel = (typeof SUPPORTED_MODELS)[number]['value']

export type UIPlatform = 'macos' | 'windows'

export interface ModelConfig {
  id: string
  model: SupportedModel
  apiUrl: string
  apiKey: string
}

const autoSave = ref(true)
const autoSaveDelay = ref(5)
const locale = ref<Locale>('en')
const theme = ref<'light' | 'dark'>('light')
const models = ref<ModelConfig[]>([])
const activeModelId = ref('')
const showKeyIds = ref<Set<string>>(new Set())
const platform = ref<UIPlatform>('macos')
const uiPlatform = ref<UIPlatform>('macos')
const debugMode = ref(false)

let loaded = false
let skipWatch = false
let savePromise: Promise<void> | null = null
let needsSave = false

function parseDelay(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10)
  return isNaN(n) || n < 1 ? 5 : n
}

export function applyTheme(t: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', t)
  try {
    if (t === 'dark') {
      WindowSetDarkTheme()
    } else {
      WindowSetLightTheme()
    }
  } catch {
    // Runtime API may not be available in non-Wails environments
  }
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
          theme: theme.value,
          models: models.value,
          activeModelId: activeModelId.value,
          uiPlatform: uiPlatform.value,
          debugMode: debugMode.value,
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
      if (s.theme === 'light' || s.theme === 'dark') {
        theme.value = s.theme
        applyTheme(theme.value)
      }
      if (Array.isArray(s.models)) models.value = s.models.map((m: any) => ({ ...m, model: m.model || 'deepseek-v4-flash', apiUrl: m.apiUrl || '' }))
      if (s.activeModelId) activeModelId.value = s.activeModelId
      if (typeof s.debugMode === 'boolean') debugMode.value = s.debugMode
      try {
        const p = await GetPlatform()
        const detected = p === 'windows' ? 'windows' : 'macos'
        platform.value = detected
        uiPlatform.value = (s.uiPlatform === 'macos' || s.uiPlatform === 'windows') ? s.uiPlatform : detected
      } catch {
        platform.value = 'macos'
        uiPlatform.value = 'macos'
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
    await nextTick()
    skipWatch = false
  }

  async function saveSettings() {
    await doSave()
    if (activeModelId.value) {
      ReloadLLM().catch(() => {})
    }
  }

  function addModel() {
    models.value.push({
      id: crypto.randomUUID(),
      model: 'deepseek-v4-flash',
      apiUrl: '',
      apiKey: '',
    })
    doSave()
  }

  function removeModel(id: string) {
    models.value = models.value.filter(m => m.id !== id)
    if (activeModelId.value === id) {
      activeModelId.value = models.value.length > 0 ? models.value[0].id : ''
    }
    const s = new Set(showKeyIds.value)
    s.delete(id)
    showKeyIds.value = s
    doSave()
  }

  function activateModel(id: string) {
    activeModelId.value = id
    doSave().then(() => ReloadLLM().catch(() => {}))
  }

  function toggleShowKey(id: string) {
    const s = new Set(showKeyIds.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    showKeyIds.value = s
  }

  return {
    autoSave, autoSaveDelay, locale, theme,
    models, activeModelId, showKeyIds,
    platform, uiPlatform, debugMode,
    loadSettings, saveSettings,
    addModel, removeModel, activateModel, toggleShowKey,
  }
}

watch([autoSave, autoSaveDelay, locale, theme, activeModelId, models, uiPlatform, debugMode], async () => {
  if (!loaded || skipWatch) return
  await doSave()
}, { deep: true })
