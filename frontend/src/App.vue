<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network, MessageSquare } from 'lucide-vue-next'
import { EventsOn, EventsOff, ClipboardGetText } from '../wailsjs/runtime/runtime'
import { GetPendingOpenFile } from '../wailsjs/go/main/App'
import AppSidebar from './components/AppSidebar.vue'
import AppEditor from './components/AppEditor.vue'
import AppStatusBar from './components/AppStatusBar.vue'
import AppSettings from './components/AppSettings.vue'
import AppTabBar from './components/AppTabBar.vue'
import AIChatPanel from './components/AIChatPanel.vue'
import AboutDialog from './components/AboutDialog.vue'
import RelationGraph from './components/RelationGraph.vue'
import { useNavigation } from './composables/useNavigation'
import { provideEditorState } from './composables/useEditorState'
import { useFileTree } from './composables/useFileTree'
import { useSettings, applyTheme } from './composables/useSettings'
import { openPageTab } from './composables/useTabs'
import { IsFullscreen } from '../wailsjs/go/main/App'

const sidebarCollapsed = ref(false)
const showAIChat = ref(false)
const isFullscreen = ref(false)
const aboutDialogVisible = ref(false)

const { currentPage, navigateTo } = useNavigation()
const { t } = useI18n()

async function checkFullscreen() {
  try {
    isFullscreen.value = await IsFullscreen()
  } catch {
    isFullscreen.value = window.outerWidth >= screen.availWidth && window.outerHeight >= screen.availHeight
  }
}

function openRelations() {
  openPageTab('relations', t('relationGraph.title'))
  navigateTo('relations')
}
provideEditorState()
const { openFolder, openFile, saveCurrentFile, newFile, restoreSession, openRecentFolder, openRecentFile, selectFile, switchToTab, closeFileTab, closeOtherTabs, closeAllTabs } = useFileTree()
const { loadSettings, theme, debugMode } = useSettings()

onMounted(async () => {
  await loadSettings()
  applyTheme(theme.value)
  await restoreSession()
  checkFullscreen()
  window.addEventListener('resize', checkFullscreen)

  const pendingPath = await GetPendingOpenFile()
  if (pendingPath) {
    await openRecentFile(pendingPath)
  }

  EventsOff('menu:navigate')
  EventsOn('menu:navigate', (page: string) => {
    if (page === 'settings') {
      openPageTab('settings', t('settings.title'))
      navigateTo('settings')
    } else if (page === 'relations') {
      openPageTab('relations', t('relationGraph.title'))
      navigateTo('relations')
    } else if (page === 'about') {
      aboutDialogVisible.value = true
    } else if (page === 'editor') {
      navigateTo('editor')
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

  EventsOff('menu:toggle-debug')
  EventsOn('menu:toggle-debug', (checked: boolean) => {
    debugMode.value = checked
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
  <div class="app-layout" :class="{ fullscreen: isFullscreen }">
    <AppSidebar v-model:collapsed="sidebarCollapsed" />
    <div class="app-content">
      <AppTabBar
        @switch="switchToTab"
        @close="closeFileTab"
        @close-other-tabs="closeOtherTabs"
        @close-all-tabs="closeAllTabs"
      />
      <div class="content-area">
        <div class="floating-actions">
          <button
            class="floating-btn"
            :class="{ active: currentPage === 'relations' }"
            title="Relation Graph"
            @click="openRelations"
          >
            <Network :size="18" />
          </button>
          <button
            class="floating-btn"
            :class="{ active: showAIChat }"
            title="AI Assistant"
            @click="showAIChat = !showAIChat"
          >
            <MessageSquare :size="18" />
          </button>
        </div>
        <AppEditor v-if="currentPage === 'editor'" />
        <AppSettings v-else-if="currentPage === 'settings'" />
        <RelationGraph v-else-if="currentPage === 'relations'" />
      </div>
      <AppStatusBar />
    </div>
    <AIChatPanel v-if="showAIChat" @close="showAIChat = false" @open-file="selectFile" />
    <AboutDialog :visible="aboutDialogVisible" @close="aboutDialogVisible = false" />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--surface-primary);
  position: relative;
  border-radius: 10px;
  overflow: hidden;
}

.app-layout.fullscreen {
  border-radius: 0;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.floating-actions {
  position: absolute;
  top: 6px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  --wails-draggable: no-drag;
}

.floating-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  border-radius: 6px;
  padding: 0;
}

.floating-btn:hover {
  color: var(--foreground-secondary);
  background: var(--surface-hover);
}

.floating-btn.active {
  color: var(--accent-primary);
  background: var(--surface-hover);
}
</style>
