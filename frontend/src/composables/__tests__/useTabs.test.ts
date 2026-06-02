import { describe, it, expect, beforeEach } from 'vitest'
import { useTabs, isPageTab, openPageTab, closeTabByPath, closeTabsUnderDir } from '../useTabs'

// useTabs uses module-level state; reset between tests via clearTabs
describe('useTabs', () => {
  beforeEach(() => {
    const { clearTabs } = useTabs()
    clearTabs()
  })

  describe('openTab', () => {
    it('adds a new tab and sets it active', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      const result = openTab('/root/notes.md')

      expect(result).toEqual({ isNew: true, index: 0 })
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0]).toEqual({ path: '/root/notes.md', title: 'notes' })
      expect(activeTabIndex.value).toBe(0)
    })

    it('extracts title by removing extension', () => {
      const { tabs, openTab } = useTabs()

      openTab('/root/my-document.md')

      expect(tabs.value[0].title).toBe('my-document')
    })

    it('uses full filename as title when no extension', () => {
      const { tabs, openTab } = useTabs()

      openTab('/root/README')

      expect(tabs.value[0].title).toBe('README')
    })

    it('uses Untitled for empty path', () => {
      const { tabs, openTab } = useTabs()

      openTab('')

      expect(tabs.value[0].title).toBe('Untitled')
    })

    it('switches to existing tab instead of creating duplicate', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(1)

      const result = openTab('/root/a.md')

      expect(result).toEqual({ isNew: false, index: 0 })
      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(0)
    })

    it('handles multiple tabs', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')

      expect(tabs.value).toHaveLength(3)
      expect(activeTabIndex.value).toBe(2)
      expect(tabs.value.map(t => t.title)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('closeTab', () => {
    it('returns null when closing the last tab', () => {
      const { openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      const result = closeTab(0)

      expect(result).toBeNull()
    })

    it('switches to adjacent tab when closing active tab', () => {
      const { tabs, activeTabIndex, openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      const result = closeTab(2)

      expect(result).toBe('/root/b.md')
      expect(activeTabIndex.value).toBe(1)
      expect(tabs.value).toHaveLength(2)
    })

    it('switches to previous tab when closing active at end', () => {
      const { tabs, activeTabIndex, openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      // active is b (index 1)

      closeTab(1)

      expect(activeTabIndex.value).toBe(0)
      expect(tabs.value).toHaveLength(1)
    })

    it('adjusts active index when closing tab before active', () => {
      const { tabs, activeTabIndex, openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      closeTab(0) // close a, b shifts to index 0, c to index 1

      expect(activeTabIndex.value).toBe(1)
      expect(tabs.value.map(t => t.path)).toEqual(['/root/b.md', '/root/c.md'])
    })

    it('does not change active index when closing tab after active', () => {
      const { tabs, activeTabIndex, openTab, closeTab, switchTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      switchTab(0) // active is a (index 0)

      closeTab(2) // close c

      expect(activeTabIndex.value).toBe(0)
      expect(tabs.value).toHaveLength(2)
    })

    it('handles closing middle tab', () => {
      const { tabs, activeTabIndex, openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      closeTab(1) // close b

      expect(activeTabIndex.value).toBe(1) // c is now at index 1
      expect(tabs.value.map(t => t.path)).toEqual(['/root/a.md', '/root/c.md'])
    })

    it('clears to empty state when all tabs closed', () => {
      const { tabs, activeTabIndex, openTab, closeTab } = useTabs()

      openTab('/root/a.md')
      closeTab(0)

      expect(tabs.value).toEqual([])
      expect(activeTabIndex.value).toBe(-1)
    })
  })

  describe('switchTab', () => {
    it('switches to the specified index', () => {
      const { activeTabIndex, openTab, switchTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      switchTab(0)

      expect(activeTabIndex.value).toBe(0)
    })

    it('does nothing when index is the same as active', () => {
      const { activeTabIndex, openTab, switchTab } = useTabs()

      openTab('/root/a.md')

      switchTab(0)

      expect(activeTabIndex.value).toBe(0)
    })

    it('does nothing for negative index', () => {
      const { activeTabIndex, openTab, switchTab } = useTabs()

      openTab('/root/a.md')

      switchTab(-1)

      expect(activeTabIndex.value).toBe(0)
    })

    it('does nothing for out-of-bounds index', () => {
      const { activeTabIndex, openTab, switchTab } = useTabs()

      openTab('/root/a.md')

      switchTab(5)

      expect(activeTabIndex.value).toBe(0)
    })
  })

  describe('clearTabs', () => {
    it('removes all tabs and resets active index', () => {
      const { tabs, activeTabIndex, openTab, clearTabs } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')

      clearTabs()

      expect(tabs.value).toEqual([])
      expect(activeTabIndex.value).toBe(-1)
    })
  })

  describe('computed properties', () => {
    it('activeTab returns current tab', () => {
      const { activeTab, openTab } = useTabs()

      openTab('/root/notes.md')

      expect(activeTab.value).toEqual({ path: '/root/notes.md', title: 'notes' })
    })

    it('activeTab returns null when no tabs', () => {
      const { activeTab } = useTabs()

      expect(activeTab.value).toBeNull()
    })

    it('activeFilePath returns path of active tab', () => {
      const { activeFilePath, openTab } = useTabs()

      openTab('/root/doc.md')

      expect(activeFilePath.value).toBe('/root/doc.md')
    })

    it('activeFilePath returns empty string when no tabs', () => {
      const { activeFilePath } = useTabs()

      expect(activeFilePath.value).toBe('')
    })
  })

  describe('isPageTab', () => {
    it('returns true for settings page', () => {
      expect(isPageTab('settings')).toBe(true)
    })

    it('returns true for relations page', () => {
      expect(isPageTab('relations')).toBe(true)
    })

    it('returns false for file paths', () => {
      expect(isPageTab('/root/doc.md')).toBe(false)
      expect(isPageTab('editor')).toBe(false)
    })
  })

  describe('openPageTab', () => {
    it('creates a new page tab and sets it active', () => {
      const { tabs, activeTabIndex } = useTabs()

      const result = openPageTab('settings', 'Settings')

      expect(result).toEqual({ isNew: true, index: 0 })
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0]).toEqual({ path: 'settings', title: 'Settings' })
      expect(activeTabIndex.value).toBe(0)
    })

    it('switches to existing page tab instead of creating duplicate', () => {
      const { tabs, activeTabIndex } = useTabs()

      openPageTab('settings', 'Settings')
      openPageTab('relations', 'Relations')
      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(1)

      const result = openPageTab('settings', 'Settings')

      expect(result).toEqual({ isNew: false, index: 0 })
      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(0)
    })

    it('creates multiple distinct page tabs', () => {
      const { tabs, activeTabIndex } = useTabs()

      openPageTab('settings', 'Settings')
      openPageTab('relations', 'Relations')

      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(1)
      expect(tabs.value.map(t => t.path)).toEqual(['settings', 'relations'])
    })
  })

  describe('activeFilePath with page tabs', () => {
    it('returns empty string when active tab is a page tab', () => {
      const { activeFilePath } = useTabs()

      openPageTab('settings', 'Settings')

      expect(activeFilePath.value).toBe('')
    })

    it('returns empty string when active tab is relations page', () => {
      const { activeFilePath } = useTabs()

      openPageTab('relations', 'Relations')

      expect(activeFilePath.value).toBe('')
    })

    it('returns file path after switching from page tab to file tab', () => {
      const { activeFilePath, openTab } = useTabs()

      openPageTab('settings', 'Settings')
      openTab('/root/doc.md')

      expect(activeFilePath.value).toBe('/root/doc.md')
    })
  })

  describe('closeTabByPath', () => {
    it('closes tab by path and returns next active path', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      const result = closeTabByPath('/root/c.md')

      expect(result).toBe('/root/b.md')
      expect(tabs.value).toHaveLength(2)
      expect(activeTabIndex.value).toBe(1)
    })

    it('returns null when path not found', () => {
      const { tabs, openTab } = useTabs()

      openTab('/root/a.md')

      const result = closeTabByPath('/root/nonexistent.md')

      expect(result).toBeNull()
      expect(tabs.value).toHaveLength(1)
    })

    it('adjusts activeTabIndex when active tab is closed', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      closeTabByPath('/root/c.md')

      expect(activeTabIndex.value).toBe(1)
      expect(tabs.value.map(t => t.path)).toEqual(['/root/a.md', '/root/b.md'])
    })

    it('returns null and resets when closing last remaining tab', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')

      const result = closeTabByPath('/root/a.md')

      expect(result).toBeNull()
      expect(tabs.value).toEqual([])
      expect(activeTabIndex.value).toBe(-1)
    })

    it('does not affect activeTabIndex when closing inactive tab', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/a.md')
      openTab('/root/b.md')
      openTab('/root/c.md')
      // active is c (index 2)

      closeTabByPath('/root/a.md')

      expect(activeTabIndex.value).toBe(1) // c shifted from 2 to 1
      expect(tabs.value.map(t => t.path)).toEqual(['/root/b.md', '/root/c.md'])
    })
  })

  describe('closeTabsUnderDir', () => {
    it('closes all tabs under a directory while keeping others', () => {
      const { tabs, openTab } = useTabs()

      openTab('/root/src/a.md')
      openTab('/root/src/b.md')
      openTab('/root/docs/c.md')

      closeTabsUnderDir('/root/src')

      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/docs/c.md')
    })

    it('adjusts activeTabIndex when active tab is under deleted directory', () => {
      const { tabs, activeTabIndex, openTab, switchTab } = useTabs()

      openTab('/root/docs/a.md')
      openTab('/root/src/b.md')
      openTab('/root/src/c.md')
      switchTab(1) // active is /root/src/b.md (index 1)

      closeTabsUnderDir('/root/src')

      expect(activeTabIndex.value).toBe(0)
      expect(tabs.value.map(t => t.path)).toEqual(['/root/docs/a.md'])
    })

    it('keeps activeTabIndex when active tab is not under deleted directory', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/docs/a.md')
      openTab('/root/src/b.md')
      // active is /root/src/b.md (index 1)

      closeTabsUnderDir('/root/docs')

      expect(activeTabIndex.value).toBe(0) // b shifted from 1 to 0
      expect(tabs.value.map(t => t.path)).toEqual(['/root/src/b.md'])
    })

    it('resets to empty state when all tabs are under the deleted directory', () => {
      const { tabs, activeTabIndex, openTab } = useTabs()

      openTab('/root/src/a.md')
      openTab('/root/src/b.md')

      closeTabsUnderDir('/root/src')

      expect(tabs.value).toEqual([])
      expect(activeTabIndex.value).toBe(-1)
    })

    it('only matches exact directory prefix', () => {
      const { tabs, openTab } = useTabs()

      openTab('/root/src-file.md')
      openTab('/root/src/a.md')

      closeTabsUnderDir('/root/src')

      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('/root/src-file.md')
    })
  })

  describe('shared state', () => {
    it('all useTabs calls share the same state', () => {
      const instance1 = useTabs()
      const instance2 = useTabs()

      instance1.openTab('/root/shared.md')

      expect(instance2.tabs.value).toHaveLength(1)
      expect(instance2.tabs.value[0].path).toBe('/root/shared.md')
      expect(instance2.activeTabIndex.value).toBe(0)
    })
  })
})
