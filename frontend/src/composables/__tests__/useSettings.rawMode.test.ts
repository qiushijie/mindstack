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

describe('useSettings - git sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function importFresh() {
    vi.resetModules()
    const mod = await import('../useSettings')
    return mod
  }

  describe('loadSettings', () => {
    it('loads defaultBranch from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { defaultBranch: 'develop' },
      }))

      const { useSettings } = await importFresh()
      const { defaultBranch, loadSettings } = useSettings()
      await loadSettings()

      expect(defaultBranch.value).toBe('develop')
    })

    it('loads autoCommit from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoCommit: true },
      }))

      const { useSettings } = await importFresh()
      const { autoCommit, loadSettings } = useSettings()
      await loadSettings()

      expect(autoCommit.value).toBe(true)
    })

    it('loads autoPull from config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue(JSON.stringify({
        settings: { autoPull: true },
      }))

      const { useSettings } = await importFresh()
      const { autoPull, loadSettings } = useSettings()
      await loadSettings()

      expect(autoPull.value).toBe(true)
    })

    it('defaults autoCommit to false when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { autoCommit, loadSettings } = useSettings()
      await loadSettings()

      expect(autoCommit.value).toBe(false)
    })

    it('defaults autoPull to false when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { autoPull, loadSettings } = useSettings()
      await loadSettings()

      expect(autoPull.value).toBe(false)
    })

    it('defaults defaultBranch to main when not in config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')

      const { useSettings } = await importFresh()
      const { defaultBranch, loadSettings } = useSettings()
      await loadSettings()

      expect(defaultBranch.value).toBe('main')
    })
  })

  describe('saveSettings', () => {
    it('persists defaultBranch to config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { defaultBranch, loadSettings, saveSettings } = useSettings()
      await loadSettings()

      defaultBranch.value = 'develop'
      await saveSettings()

      expect(SaveConfig).toHaveBeenCalledWith(expect.stringContaining('"defaultBranch":"develop"'))
    })

    it('persists autoCommit=true to config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoCommit, loadSettings, saveSettings } = useSettings()
      await loadSettings()

      autoCommit.value = true
      await saveSettings()

      expect(SaveConfig).toHaveBeenCalledWith(expect.stringContaining('"autoCommit":true'))
    })

    it('persists autoPull=true to config', async () => {
      vi.mocked(LoadConfig).mockResolvedValue('{}')
      vi.mocked(SaveConfig).mockResolvedValue('')

      const { useSettings } = await importFresh()
      const { autoPull, loadSettings, saveSettings } = useSettings()
      await loadSettings()

      autoPull.value = true
      await saveSettings()

      expect(SaveConfig).toHaveBeenCalledWith(expect.stringContaining('"autoPull":true'))
    })
  })

  describe('return value', () => {
    it('exposes defaultBranch ref', async () => {
      const { useSettings } = await importFresh()
      const { defaultBranch } = useSettings()

      expect(defaultBranch).toBeDefined()
      expect(defaultBranch.value).toBe('main')
    })

    it('defaultBranch ref is reactive', async () => {
      const { useSettings } = await importFresh()
      const { defaultBranch } = useSettings()

      defaultBranch.value = 'develop'
      expect(defaultBranch.value).toBe('develop')

      defaultBranch.value = 'main'
      expect(defaultBranch.value).toBe('main')
    })

    it('exposes autoCommit ref', async () => {
      const { useSettings } = await importFresh()
      const { autoCommit } = useSettings()

      expect(autoCommit).toBeDefined()
      expect(autoCommit.value).toBe(false)
    })

    it('autoCommit ref is reactive', async () => {
      const { useSettings } = await importFresh()
      const { autoCommit } = useSettings()

      autoCommit.value = true
      expect(autoCommit.value).toBe(true)

      autoCommit.value = false
      expect(autoCommit.value).toBe(false)
    })

    it('exposes autoPull ref', async () => {
      const { useSettings } = await importFresh()
      const { autoPull } = useSettings()

      expect(autoPull).toBeDefined()
      expect(autoPull.value).toBe(false)
    })

    it('autoPull ref is reactive', async () => {
      const { useSettings } = await importFresh()
      const { autoPull } = useSettings()

      autoPull.value = true
      expect(autoPull.value).toBe(true)

      autoPull.value = false
      expect(autoPull.value).toBe(false)
    })
  })
})
