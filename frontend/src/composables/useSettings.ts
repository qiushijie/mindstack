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
const lineNumbers = ref(true)
const wordWrap = ref(true)
const models = ref<ModelConfig[]>([])
const activeModelId = ref('')
const showKeyIds = ref<Set<string>>(new Set())
const platform = ref<UIPlatform>('macos')
const uiPlatform = ref<UIPlatform>('macos')
const rawMode = ref(false)
const debugMode = ref(false)
const defaultBranch = ref('main')
const autoCommit = ref(false)
const autoPull = ref(false)
const gitRemote = ref('')

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
      try {
        const raw = await LoadConfig()
        const config = JSON.parse(raw || '{}')
        config.settings = {
          autoSave: autoSave.value,
          autoSaveDelay: autoSaveDelay.value,
          locale: locale.value,
          theme: theme.value,
          lineNumbers: lineNumbers.value,
          wordWrap: wordWrap.value,
          models: models.value,
          activeModelId: activeModelId.value,
          uiPlatform: uiPlatform.value,
          debugMode: debugMode.value,
          defaultBranch: defaultBranch.value,
          autoCommit: autoCommit.value,
          autoPull: autoPull.value,
          gitRemote: gitRemote.value,
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
    try {
      const raw = await LoadConfig()
      const config = JSON.parse(raw || '{}')
      const s = config.settings || {}
      if (s.autoSave !== undefined) autoSave.value = s.autoSave
      if (s.autoSaveDelay !== undefined) autoSaveDelay.value = parseDelay(s.autoSaveDelay)
      if (s.locale) {
        locale.value = s.locale as Locale
        setLocale(locale.value)
        SetLocale(locale.value).catch((err) => { console.warn('[Settings] Failed to set locale:', err) })
      }
      if (s.theme === 'light' || s.theme === 'dark') {
        theme.value = s.theme
        applyTheme(theme.value)
      }
      if (typeof s.lineNumbers === 'boolean') lineNumbers.value = s.lineNumbers
      if (typeof s.wordWrap === 'boolean') wordWrap.value = s.wordWrap
      if (Array.isArray(s.models)) models.value = s.models.map((m: any) => ({ ...m, model: m.model || 'deepseek-v4-flash', apiUrl: m.apiUrl || '' }))
      if (s.activeModelId) activeModelId.value = s.activeModelId
      if (typeof s.debugMode === 'boolean') debugMode.value = s.debugMode
      if (s.defaultBranch) defaultBranch.value = s.defaultBranch
      if (typeof s.autoCommit === 'boolean') autoCommit.value = s.autoCommit
      if (typeof s.autoPull === 'boolean') autoPull.value = s.autoPull
      if (s.gitRemote) gitRemote.value = s.gitRemote
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
    loaded = true
    await nextTick()
    skipWatch = false
  }

  async function saveSettings() {
    await doSave()
    if (activeModelId.value) {
      ReloadLLM().catch((err) => { console.warn('[Settings] Failed to reload LLM:', err) })
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
    doSave().then(() => ReloadLLM().catch((err) => { console.warn('[Settings] Failed to reload LLM:', err) }))
  }

  function toggleShowKey(id: string) {
    const s = new Set(showKeyIds.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    showKeyIds.value = s
  }

  return {
    autoSave, autoSaveDelay, locale, theme, lineNumbers, wordWrap,
    models, activeModelId, showKeyIds,
    platform, uiPlatform, rawMode, debugMode,
    defaultBranch, autoCommit, autoPull, gitRemote,
    loadSettings, saveSettings,
    addModel, removeModel, activateModel, toggleShowKey,
  }
}

watch([autoSave, autoSaveDelay, locale, theme, lineNumbers, wordWrap, activeModelId, models, uiPlatform, debugMode, defaultBranch, autoCommit, autoPull, gitRemote], async () => {
  if (!loaded || skipWatch) return
  await doSave()
}, { deep: true })

// Apply locale to i18n and notify Go backend when locale ref changes.
// This is separate from doSave so that model-only operations (addModel,
// removeModel) don't re-apply locale and potentially reset it in E2E tests.
watch(locale, (newLocale) => {
  if (!loaded) return
  setLocale(newLocale)
  SetLocale(newLocale).catch((err) => { console.warn('[Settings] Failed to set locale:', err) })
})
