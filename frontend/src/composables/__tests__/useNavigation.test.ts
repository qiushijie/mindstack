import { describe, it, expect, beforeEach } from 'vitest'
import { useNavigation } from '../useNavigation'

// useNavigation uses a module-level ref; reset between tests via navigateTo('editor')
describe('useNavigation', () => {
  beforeEach(() => {
    const { navigateTo } = useNavigation()
    navigateTo('editor')
  })

  describe('initial state', () => {
    it('currentPage should be "editor"', () => {
      const { currentPage } = useNavigation()

      expect(currentPage.value).toBe('editor')
    })
  })

  describe('navigateTo', () => {
    it('changes currentPage to "settings"', () => {
      const { currentPage, navigateTo } = useNavigation()

      navigateTo('settings')

      expect(currentPage.value).toBe('settings')
    })

    it('changes currentPage to "relations"', () => {
      const { currentPage, navigateTo } = useNavigation()

      navigateTo('relations')

      expect(currentPage.value).toBe('relations')
    })

    it('changes currentPage back to "editor"', () => {
      const { currentPage, navigateTo } = useNavigation()

      navigateTo('settings')
      expect(currentPage.value).toBe('settings')

      navigateTo('editor')
      expect(currentPage.value).toBe('editor')
    })
  })

  describe('singleton behavior', () => {
    it('multiple calls to useNavigation() return the same currentPage ref', () => {
      const instance1 = useNavigation()
      const instance2 = useNavigation()

      instance1.navigateTo('settings')

      expect(instance2.currentPage.value).toBe('settings')
    })
  })

  describe('DEV mode __navigateTo', () => {
    it('window.__navigateTo changes currentPage for valid pages', () => {
      if (!import.meta.env.DEV) return

      const { currentPage } = useNavigation()
      const navigate = (window as any).__navigateTo

      navigate('settings')
      expect(currentPage.value).toBe('settings')

      navigate('relations')
      expect(currentPage.value).toBe('relations')

      navigate('editor')
      expect(currentPage.value).toBe('editor')
    })

    it('ignores invalid page names', () => {
      if (!import.meta.env.DEV) return

      const { currentPage } = useNavigation()
      const navigate = (window as any).__navigateTo

      navigate('invalid-page')
      expect(currentPage.value).toBe('editor')

      navigate('random')
      expect(currentPage.value).toBe('editor')
    })
  })
})
