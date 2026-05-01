import { ref, computed } from 'vue'

export interface Tab {
  path: string
  title: string
}

const tabs = ref<Tab[]>([])
const activeTabIndex = ref(-1)

export function useTabs() {
  const activeTab = computed(() => tabs.value[activeTabIndex.value] ?? null)
  const activeFilePath = computed(() => activeTab.value?.path ?? '')

  function openTab(path: string): { isNew: boolean; index: number } {
    const existing = tabs.value.findIndex(t => t.path === path)
    if (existing >= 0) {
      activeTabIndex.value = existing
      return { isNew: false, index: existing }
    }
    const filename = path.split('/').pop() || 'Untitled'
    const title = filename.lastIndexOf('.') > 0 ? filename.substring(0, filename.lastIndexOf('.')) : filename
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

  return { tabs, activeTabIndex, activeTab, activeFilePath, openTab, closeTab, switchTab, clearTabs }
}
