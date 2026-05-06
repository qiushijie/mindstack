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

import { LoadConfig, SaveConfig } from '../../../wailsjs/go/main/App'

describe('useSettings - raw mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function importFresh() {
    vi.resetModules()
    const mod = await import('../useSettings')
    return mod
  }

  describe('loadSettings', () => {
    it('loads rawMode from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { rawMode: true },
      }))

      const { useSettings } = await importFresh()
      const { rawMode, loadSettings } = useSettings()
      await loadSettings()

      expect(rawMode.value).toBe(true)
    })

    it('defaults rawMode to false when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { rawMode, loadSettings } = useSettings()
      await loadSettings()

      expect(rawMode.value).toBe(false)
    })
  })

  describe('saveSettings', () => {
    it('persists rawMode=true to config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { rawMode: true },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { rawMode, loadSettings, saveSettings } = useSettings()
      await loadSettings()

      rawMode.value = true
      await saveSettings()

      expect(SaveConfig).toHaveBeenCalledWith(expect.stringContaining('"rawMode":true'))
    })

    it('persists rawMode=false to config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { rawMode: false },
      }))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { rawMode, loadSettings, saveSettings } = useSettings()
      await loadSettings()

      rawMode.value = false
      await saveSettings()

      expect(SaveConfig).toHaveBeenCalledWith(expect.stringContaining('"rawMode":false'))
    })
  })

  describe('return value', () => {
    it('exposes rawMode ref', async () => {
      const { useSettings } = await importFresh()
      const { rawMode } = useSettings()

      expect(rawMode).toBeDefined()
      expect(rawMode.value).toBe(false)
    })

    it('rawMode ref is reactive', async () => {
      const { useSettings } = await importFresh()
      const { rawMode } = useSettings()

      rawMode.value = true
      expect(rawMode.value).toBe(true)

      rawMode.value = false
      expect(rawMode.value).toBe(false)
    })
  })
})
