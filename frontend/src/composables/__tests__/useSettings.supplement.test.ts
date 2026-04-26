import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  LoadConfig: vi.fn(),
  SaveConfig: vi.fn(),
  SetLocale: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  WindowSetLightTheme: vi.fn(),
  WindowSetDarkTheme: vi.fn(),
}))

vi.mock('../../i18n', () => ({
  setLocale: vi.fn(),
}))

import { LoadConfig, SaveConfig, SetLocale } from '../../../wailsjs/go/main/App'
import { WindowSetLightTheme, WindowSetDarkTheme } from '../../../wailsjs/runtime/runtime'
import { setLocale } from '../../i18n'

describe('useSettings - supplementary coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importFresh() {
    vi.resetModules()
    const mod = await import('../useSettings')
    return mod
  }

  describe('applyTheme', () => {
    it('sets data-theme attribute to dark', async () => {
      const { applyTheme } = await importFresh()
      applyTheme('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('sets data-theme attribute to light', async () => {
      const { applyTheme } = await importFresh()
      applyTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('calls WindowSetDarkTheme for dark mode', async () => {
      const { applyTheme } = await importFresh()
      applyTheme('dark')
      expect(WindowSetDarkTheme).toHaveBeenCalledTimes(1)
    })

    it('calls WindowSetLightTheme for light mode', async () => {
      const { applyTheme } = await importFresh()
      applyTheme('light')
      expect(WindowSetLightTheme).toHaveBeenCalledTimes(1)
    })

    it('handles runtime error gracefully', async () => {
      vi.mocked(WindowSetDarkTheme).mockImplementation(() => { throw new Error('runtime error') })
      const { applyTheme } = await importFresh()
      expect(() => applyTheme('dark')).not.toThrow()
    })
  })

  describe('saveSettings', () => {
    it('calls doSave when invoked', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { loadSettings, saveSettings } = useSettings()
      await loadSettings()

      await saveSettings()

      expect(SaveConfig).toHaveBeenCalled()
    })
  })

  describe('locale loading', () => {
    it('loads locale from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { locale: 'zh' },
      }))

      const { useSettings } = await importFresh()
      const { locale, loadSettings } = useSettings()
      await loadSettings()

      expect(locale.value).toBe('zh')
      expect(setLocale).toHaveBeenCalledWith('zh')
    })

    it('calls SetLocale when loading locale', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { locale: 'ja' },
      }))

      const { useSettings } = await importFresh()
      const { loadSettings } = useSettings()
      await loadSettings()

      expect(SetLocale).toHaveBeenCalledWith('ja')
    })

    it('keeps default locale when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { locale, loadSettings } = useSettings()
      await loadSettings()

      expect(locale.value).toBe('en')
    })
  })

  describe('theme loading', () => {
    it('loads theme from config and applies it', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { theme: 'dark' },
      }))

      const { useSettings } = await importFresh()
      const { theme, loadSettings } = useSettings()
      await loadSettings()

      expect(theme.value).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
      expect(WindowSetDarkTheme).toHaveBeenCalled()
    })

    it('keeps light theme when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { theme, loadSettings } = useSettings()
      await loadSettings()

      expect(theme.value).toBe('light')
    })

    it('ignores invalid theme values', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { theme: 'invalid' },
      }))

      const { useSettings } = await importFresh()
      const { theme, loadSettings } = useSettings()
      await loadSettings()

      expect(theme.value).toBe('light')
    })
  })

  describe('watch persistence', () => {
    it('saves when locale changes', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { locale, loadSettings } = useSettings()
      await loadSettings()

      locale.value = 'fr'
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.locale).toBe('fr')
    })

    it('saves when theme changes', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { theme, loadSettings } = useSettings()
      await loadSettings()

      theme.value = 'dark'
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.theme).toBe('dark')
    })

    it('saves all settings fields together', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoSave, autoSaveDelay, locale, theme, loadSettings } = useSettings()
      await loadSettings()

      autoSave.value = false
      autoSaveDelay.value = 10
      locale.value = 'de'
      theme.value = 'dark'
      await vi.advanceTimersByTimeAsync(0)

      // Should have saved at least once
      expect(SaveConfig).toHaveBeenCalled()
    })

    it('handles concurrent save requests', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      let saveCount = 0
      vi.mocked(SaveConfig).mockImplementation(async () => {
        saveCount++
        await new Promise(r => setTimeout(r, 50))
        return ''
      })

      const { useSettings } = await importFresh()
      const { autoSave, loadSettings } = useSettings()
      await loadSettings()

      autoSave.value = false
      await vi.advanceTimersByTimeAsync(0)

      // Trigger another change while first save is in progress
      autoSave.value = true
      await vi.advanceTimersByTimeAsync(0)

      // Let the first save complete and check if second was queued
      await vi.advanceTimersByTimeAsync(100)

      expect(saveCount).toBeGreaterThanOrEqual(1)
    })
  })
})
