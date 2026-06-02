import { ref, computed } from 'vue'
import type { PageName } from './useNavigation'
import { t } from '../i18n'

export interface Tab {
  path: string
  title: string
}

const PAGE_TABS = new Set<string>(['settings', 'relations', 'diff'])
const UNTITLED_PREFIX = '__untitled__'

const tabs = ref<Tab[]>([])
const activeTabIndex = ref(-1)
let untitledCounter = 0

export function isPageTab(path: string): boolean {
  return PAGE_TABS.has(path)
}

export function isUntitledPath(path: string): boolean {
  return path.startsWith(UNTITLED_PREFIX)
}

export function nextUntitledPath(): string {
  untitledCounter++
  return `${UNTITLED_PREFIX}${untitledCounter}`
}

export function openPageTab(pageName: PageName, title: string): { isNew: boolean; index: number } {
  const existing = tabs.value.findIndex(t => t.path === pageName)
  if (existing >= 0) {
    activeTabIndex.value = existing
    return { isNew: false, index: existing }
  }
  tabs.value.push({ path: pageName, title })
  activeTabIndex.value = tabs.value.length - 1
  return { isNew: true, index: activeTabIndex.value }
}

export function closeTabByPath(path: string): string | null {
  const index = tabs.value.findIndex(t => t.path === path)
  if (index < 0) return null
  tabs.value.splice(index, 1)
  if (tabs.value.length === 0) {
    activeTabIndex.value = -1
    return null
  }
  if (activeTabIndex.value > index) {
    activeTabIndex.value--
  } else if (activeTabIndex.value === index) {
    activeTabIndex.value = Math.min(index, tabs.value.length - 1)
  } else if (activeTabIndex.value >= tabs.value.length) {
    activeTabIndex.value = tabs.value.length - 1
  }
  return tabs.value[activeTabIndex.value]?.path ?? null
}

export function closeTabsUnderDir(dirPath: string) {
  const prefix = dirPath + '/'
  tabs.value = tabs.value.filter(t => !t.path.startsWith(prefix))
  if (tabs.value.length === 0) {
    activeTabIndex.value = -1
  } else if (activeTabIndex.value >= tabs.value.length) {
    activeTabIndex.value = tabs.value.length - 1
  }
}

export function useTabs() {
  const activeTab = computed(() => tabs.value[activeTabIndex.value] ?? null)
  const activeFilePath = computed(() => {
    const tab = activeTab.value
    return tab && !isPageTab(tab.path) ? tab.path : ''
  })

  function openTab(path: string): { isNew: boolean; index: number } {
    const existing = tabs.value.findIndex(t => t.path === path)
    if (existing >= 0) {
      activeTabIndex.value = existing
      return { isNew: false, index: existing }
    }
    let title: string
    if (isUntitledPath(path)) {
      title = t('editor.untitled')
    } else {
      const filename = path.split('/').pop() || 'Untitled'
      title = filename.lastIndexOf('.') > 0 ? filename.substring(0, filename.lastIndexOf('.')) : filename
    }
    tabs.value.push({ path, title })
    activeTabIndex.value = tabs.value.length - 1
    return { isNew: true, index: activeTabIndex.value }
  }

  function closeTab(index: number): string | null {
    if (index < 0 || index >= tabs.value.length) return null
    tabs.value.splice(index, 1)
    if (tabs.value.length === 0) {
      activeTabIndex.value = -1
      return null
    }
    if (activeTabIndex.value > index) {
      activeTabIndex.value--
    } else if (activeTabIndex.value === index) {
      activeTabIndex.value = Math.min(index, tabs.value.length - 1)
    } else if (activeTabIndex.value >= tabs.value.length) {
      activeTabIndex.value = tabs.value.length - 1
    }
    return tabs.value[activeTabIndex.value]?.path ?? null
  }

  function switchTab(index: number) {
    if (index >= 0 && index < tabs.value.length && index !== activeTabIndex.value) {
      activeTabIndex.value = index
    }
  }

  function clearTabs() {
    tabs.value = []
    activeTabIndex.value = -1
  }

  if (import.meta.env.DEV) {
    ;(window as any).__clearTabs = clearTabs
  }

  return { tabs, activeTabIndex, activeTab, activeFilePath, openTab, closeTab, switchTab, clearTabs }
}
