import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  LoadConfig: vi.fn(),
  SaveConfig: vi.fn(),
  SetLocale: vi.fn().mockResolvedValue(undefined),
  ReloadLLM: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  WindowSetLightTheme: vi.fn(),
  WindowSetDarkTheme: vi.fn(),
}))

import { LoadConfig, SaveConfig, ReloadLLM } from '../../../wailsjs/go/main/App'

describe('useSettings - model management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importFresh() {
    vi.resetModules()
    const mod = await import('../useSettings')
    return mod
  }

  describe('loadSettings - models', () => {
    it('loads models from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [
            { id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'key1' },
            { id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'key2' },
          ],
          activeModelId: 'm2',
        },
      }))

      const { useSettings } = await importFresh()
      const { models, activeModelId, loadSettings } = useSettings()
      await loadSettings()

      expect(models.value).toHaveLength(2)
      expect(models.value[0]).toEqual({ id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'key1' })
      expect(models.value[1]).toEqual({ id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'key2' })
      expect(activeModelId.value).toBe('m2')
    })

    it('defaults to empty models when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { models, activeModelId, loadSettings } = useSettings()
      await loadSettings()

      expect(models.value).toHaveLength(0)
      expect(activeModelId.value).toBe('')
    })

    it('fills default model field when missing', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [{ id: 'm1', apiUrl: 'https://a.com/v1', apiKey: 'key1' }],
        },
      }))

      const { useSettings } = await importFresh()
      const { models, loadSettings } = useSettings()
      await loadSettings()

      expect(models.value[0].model).toBe('deepseek-v4-flash')
    })

    it('fills default apiUrl when missing', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [{ id: 'm1', model: 'deepseek-v4-flash', apiKey: 'key1' }],
        },
      }))

      const { useSettings } = await importFresh()
      const { models, loadSettings } = useSettings()
      await loadSettings()

      expect(models.value[0].apiUrl).toBe('')
    })
  })

  describe('addModel', () => {
    it('adds a model with defaults', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { models, loadSettings, addModel } = useSettings()
      await loadSettings()

      addModel()

      expect(models.value).toHaveLength(1)
      expect(models.value[0].model).toBe('deepseek-v4-flash')
      expect(models.value[0].apiUrl).toBe('')
      expect(models.value[0].apiKey).toBe('')
      expect(models.value[0].id).toMatch(/^[\da-f-]+$/)
    })

    it('adds multiple models', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { models, loadSettings, addModel } = useSettings()
      await loadSettings()

      addModel()
      addModel()

      expect(models.value).toHaveLength(2)
      expect(models.value[0].id).not.toBe(models.value[1].id)
    })

    it('triggers save after adding', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, addModel } = useSettings()
      await loadSettings()

      addModel()
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.models).toHaveLength(1)
    })
  })

  describe('removeModel', () => {
    async function setupWithTwoModels() {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [
            { id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'k1' },
            { id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'k2' },
          ],
          activeModelId: 'm1',
        },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const settings = useSettings()
      await settings.loadSettings()
      return settings
    }

    it('removes the specified model', async () => {
      const { models, removeModel } = await setupWithTwoModels()

      removeModel('m1')

      expect(models.value).toHaveLength(1)
      expect(models.value[0].id).toBe('m2')
    })

    it('falls back active to first remaining model', async () => {
      const { activeModelId, removeModel } = await setupWithTwoModels()

      expect(activeModelId.value).toBe('m1')
      removeModel('m1')

      expect(activeModelId.value).toBe('m2')
    })

    it('clears activeModelId when last model removed', async () => {
      const { models, activeModelId, removeModel } = await setupWithTwoModels()

      removeModel('m1')
      removeModel('m2')

      expect(models.value).toHaveLength(0)
      expect(activeModelId.value).toBe('')
    })

    it('does not change activeModelId when removing inactive model', async () => {
      const { activeModelId, removeModel } = await setupWithTwoModels()

      removeModel('m2')

      expect(activeModelId.value).toBe('m1')
    })

    it('removes from showKeyIds', async () => {
      const { showKeyIds, toggleShowKey, removeModel } = await setupWithTwoModels()

      toggleShowKey('m1')
      expect(showKeyIds.value.has('m1')).toBe(true)

      removeModel('m1')
      expect(showKeyIds.value.has('m1')).toBe(false)
    })

    it('triggers save after removing', async () => {
      const { removeModel } = await setupWithTwoModels()

      removeModel('m1')
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
    })
  })

  describe('activateModel', () => {
    it('sets the active model id', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [
            { id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'k1' },
            { id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'k2' },
          ],
          activeModelId: 'm1',
        },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { activeModelId, loadSettings, activateModel } = useSettings()
      await loadSettings()

      activateModel('m2')

      expect(activeModelId.value).toBe('m2')
    })

    it('saves config and then reloads LLM', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [{ id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'k1' }],
          activeModelId: 'm1',
        },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, activateModel } = useSettings()
      await loadSettings()

      activateModel('m1')

      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
      expect(ReloadLLM).toHaveBeenCalled()
    })

    it('saves active model change via watch', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [
            { id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'k1' },
            { id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'k2' },
          ],
        },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { activeModelId, loadSettings } = useSettings()
      await loadSettings()

      activeModelId.value = 'm2'
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.activeModelId).toBe('m2')
    })
  })

  describe('saveSettings', () => {
    it('calls ReloadLLM when activeModelId is set', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: {
          models: [{ id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'k1' }],
          activeModelId: 'm1',
        },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, saveSettings } = useSettings()
      await loadSettings()

      await saveSettings()

      expect(ReloadLLM).toHaveBeenCalled()
    })

    it('does not call ReloadLLM when no active model', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, saveSettings } = useSettings()
      await loadSettings()

      await saveSettings()

      expect(ReloadLLM).not.toHaveBeenCalled()
    })
  })

  describe('toggleShowKey', () => {
    it('adds id to showKeyIds', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { showKeyIds, loadSettings, toggleShowKey } = useSettings()
      await loadSettings()

      toggleShowKey('m1')

      expect(showKeyIds.value.has('m1')).toBe(true)
    })

    it('removes id from showKeyIds on second toggle', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { showKeyIds, loadSettings, toggleShowKey } = useSettings()
      await loadSettings()

      toggleShowKey('m1')
      toggleShowKey('m1')

      expect(showKeyIds.value.has('m1')).toBe(false)
    })

    it('does not trigger save', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, toggleShowKey } = useSettings()
      await loadSettings()

      toggleShowKey('m1')

      expect(SaveConfig).not.toHaveBeenCalled()
    })
  })

  describe('model persistence round-trip', () => {
    it('preserves models through save and reload', async () => {
      vi.mocked(SaveConfig).mockResolvedValue('')

      const modelData = [
        { id: 'm1', model: 'deepseek-v4-flash', apiUrl: 'https://a.com/v1', apiKey: 'secret1' },
        { id: 'm2', model: 'deepseek-v4-pro', apiUrl: 'https://b.com/v1', apiKey: 'secret2' },
      ]

      // First instance: load, add models, save
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      let { useSettings } = await importFresh()
      let settings = useSettings()
      await settings.loadSettings()
      settings.models.value = modelData as any
      settings.activeModelId.value = 'm2'
      await settings.saveSettings()

      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.models).toEqual(modelData)
      expect(saved.settings.activeModelId).toBe('m2')

      // Second instance: reload from saved data
      vi.mocked(LoadConfig).mockResolvedValue(savedArg)
      const mod2 = await importFresh()
      const settings2 = mod2.useSettings()
      await settings2.loadSettings()

      expect(settings2.models.value).toEqual(modelData)
      expect(settings2.activeModelId.value).toBe('m2')
    })
  })
})
