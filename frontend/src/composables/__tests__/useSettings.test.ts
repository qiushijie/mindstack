import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../wailsjs/go/main/App', () => ({
  LoadConfig: vi.fn(),
  SaveConfig: vi.fn(),
}))

import { LoadConfig, SaveConfig } from '../../../wailsjs/go/main/App'

// useSettings has module-level state; we need to isolate between tests.
// Using vi.resetModules to re-import a fresh module each time.
describe('useSettings', () => {
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

  describe('loadSettings', () => {
    it('loads settings from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSave: false, autoSaveDelay: 10 },
      }))

      const { useSettings } = await importFresh()
      const { autoSave, autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSave.value).toBe(false)
      expect(autoSaveDelay.value).toBe(10)
    })

    it('uses defaults when config is empty', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { autoSave, autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSave.value).toBe(true)
      expect(autoSaveDelay.value).toBe(5)
    })

    it('uses defaults when LoadConfig fails', async () => {
      vi.mocked(LoadConfig).mockRejectedValue(new Error('fail'))

      const { useSettings } = await importFresh()
      const { autoSave, autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSave.value).toBe(true)
      expect(autoSaveDelay.value).toBe(5)
    })

    it('skips on second call', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSave: false, autoSaveDelay: 10 },
      }))

      const { useSettings } = await importFresh()
      const { loadSettings } = useSettings()

      await loadSettings()

      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSave: true, autoSaveDelay: 20 },
      }))

      await loadSettings()

      // Second call should be a no-op
      expect(LoadConfig).toHaveBeenCalledTimes(1)
    })

    it('parses string delay value', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSaveDelay: '3' },
      }))

      const { useSettings } = await importFresh()
      const { autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSaveDelay.value).toBe(3)
    })

    it('falls back to 5 for NaN delay', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSaveDelay: 'abc' },
      }))

      const { useSettings } = await importFresh()
      const { autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSaveDelay.value).toBe(5)
    })

    it('falls back to 5 for delay less than 1', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSaveDelay: 0 },
      }))

      const { useSettings } = await importFresh()
      const { autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      expect(autoSaveDelay.value).toBe(5)
    })

    it('preserves existing config fields when loading', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        lastFolderPath: '/root',
        settings: { autoSave: false, autoSaveDelay: 10 },
      }))

      const { useSettings } = await importFresh()
      const { autoSave, loadSettings } = useSettings()

      await loadSettings()

      // Now change a setting to trigger the watch
      autoSave.value = true
      await vi.advanceTimersByTimeAsync(0)

      // SaveConfig should preserve lastFolderPath
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.lastFolderPath).toBe('/root')
      expect(saved.settings.autoSave).toBe(true)
    })
  })

  describe('settings persistence', () => {
    it('saves settings to config on change', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoSave, loadSettings } = useSettings()

      await loadSettings()

      autoSave.value = false
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalledTimes(1)
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.autoSave).toBe(false)
    })

    it('does not save before loadSettings is called', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { autoSave } = useSettings()

      autoSave.value = false
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).not.toHaveBeenCalled()
    })

    it('does not save during loadSettings', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoSave: false, autoSaveDelay: 10 },
      }))

      const { useSettings } = await importFresh()
      const { loadSettings } = useSettings()

      await loadSettings()

      // Settings were set inside loadSettings but watch was skipped
      expect(SaveConfig).not.toHaveBeenCalled()
    })

    it('handles SaveConfig failure gracefully', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockRejectedValue(new Error('disk full'))

      const { useSettings } = await importFresh()
      const { autoSave, loadSettings } = useSettings()

      await loadSettings()

      // Should not throw
      autoSave.value = false
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalled()
    })

    it('saves autoSaveDelay changes', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoSaveDelay, loadSettings } = useSettings()

      await loadSettings()

      autoSaveDelay.value = 15
      await vi.advanceTimersByTimeAsync(0)

      expect(SaveConfig).toHaveBeenCalledTimes(1)
      const savedArg = vi.mocked(SaveConfig).mock.calls[0][0]
      const saved = JSON.parse(savedArg)
      expect(saved.settings.autoSaveDelay).toBe(15)
    })

    it('handles LoadConfig failure during watch gracefully', async () => {
      vi.mocked(LoadConfig).mockResolvedValueOnce('{}').mockRejectedValueOnce(new Error('fail'))
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoSave, loadSettings } = useSettings()

      await loadSettings()

      autoSave.value = false
      await vi.advanceTimersByTimeAsync(0)

      // Should not throw, SaveConfig may not be called since LoadConfig failed
    })
  })
})
