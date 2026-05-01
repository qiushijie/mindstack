<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { EventsOn, EventsOff, ClipboardGetText } from '../wailsjs/runtime/runtime'
import { GetPendingOpenFile } from '../wailsjs/go/main/App'
import AppSidebar from './components/AppSidebar.vue'
import AppEditor from './components/AppEditor.vue'
import AppStatusBar from './components/AppStatusBar.vue'
import AppSettings from './components/AppSettings.vue'
import AppTabBar from './components/AppTabBar.vue'
import AIChatPanel from './components/AIChatPanel.vue'
import { useNavigation } from './composables/useNavigation'
import { provideEditorState } from './composables/useEditorState'
import { useFileTree } from './composables/useFileTree'
import { useSettings, applyTheme } from './composables/useSettings'

const sidebarCollapsed = ref(false)
const showAIChat = ref(false)

const { currentPage, navigateTo } = useNavigation()
provideEditorState()
const { openFolder, openFile, saveCurrentFile, newFile, restoreSession, openRecentFolder, openRecentFile, selectFile, switchToTab, closeFileTab } = useFileTree()
const { loadSettings, theme } = useSettings()

onMounted(async () => {
  await loadSettings()
  applyTheme(theme.value)
  await restoreSession()

  const pendingPath = await GetPendingOpenFile()
  if (pendingPath) {
    await openRecentFile(pendingPath)
  }

  EventsOff('menu:navigate')
  EventsOn('menu:navigate', (page: string) => {
    if (page === 'settings' || page === 'editor') {
      navigateTo(page)
    }
  })

  EventsOff('menu:file:open')
  EventsOn('menu:file:open', () => {
    openFolder()
  })

  EventsOff('menu:file:open-file')
  EventsOn('menu:file:open-file', () => {
    openFile()
  })

  EventsOff('menu:file:open-path')
  EventsOn('menu:file:open-path', (path: string) => {
    if (path) {
      openRecentFile(path)
    }
  })

  EventsOff('menu:file:open-recent')
  EventsOn('menu:file:open-recent', (path: string, isDir: boolean) => {
    if (isDir) {
      openRecentFolder(path)
    } else {
      openRecentFile(path)
    }
  })

  EventsOff('menu:file:save')
  EventsOn('menu:file:save', () => {
    saveCurrentFile()
  })

  EventsOff('menu:open-devtools')
  EventsOn('menu:open-devtools', () => {
    const w = window as any
    if (w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.external) {
      w.webkit.messageHandlers.external.postMessage('wails:openInspector')
    }
  })

  EventsOff('menu:file:new')
  EventsOn('menu:file:new', () => {
    newFile()
  })

  EventsOff('menu:edit:cut')
  EventsOn('menu:edit:cut', () => {
    document.execCommand('cut')
  })

  EventsOff('menu:edit:copy')
  EventsOn('menu:edit:copy', () => {
    document.execCommand('copy')
  })

  EventsOff('menu:edit:paste')
  EventsOn('menu:edit:paste', async () => {
    const el = document.activeElement
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const text = await ClipboardGetText()
      if (!text) return
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const newValue = el.value.slice(0, start) + text + el.value.slice(end)
      el.value = newValue
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.setSelectionRange(start + text.length, start + text.length)
    }
  })
})
</script>

<template>
  <div class="app-layout">
    <AppSidebar v-if="currentPage === 'editor'" v-model:collapsed="sidebarCollapsed" />
    <div class="app-content">
      <template v-if="currentPage === 'editor'">
        <AppTabBar
          :ai-active="showAIChat"
          @switch="switchToTab"
          @close="closeFileTab"
          @toggle-ai="showAIChat = !showAIChat"
        />
        <AppEditor />
        <AppStatusBar />
      </template>
      <AppSettings v-else-if="currentPage === 'settings'" />
    </div>
    <template v-if="currentPage === 'editor'">
      <AIChatPanel v-if="showAIChat" @close="showAIChat = false" @open-file="selectFile" />
    </template>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--surface-primary);
  position: relative;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
