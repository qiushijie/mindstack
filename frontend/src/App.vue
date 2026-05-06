<script lang="ts" setup>
import { ref, provide, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { EventsOn, EventsOff, ClipboardGetText } from '../wailsjs/runtime/runtime'
import { GetPendingOpenFile } from '../wailsjs/go/main/App'
import AppSidebar from './components/AppSidebar.vue'
import AppEditor from './components/AppEditor.vue'
import AppStatusBar from './components/AppStatusBar.vue'
import AppSettings from './components/AppSettings.vue'
import AppTabBar from './components/AppTabBar.vue'
import AIChatPanel from './components/AIChatPanel.vue'
import AboutDialog from './components/AboutDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import RelationGraph from './components/RelationGraph.vue'
import { useNavigation } from './composables/useNavigation'
import { provideEditorState } from './composables/useEditorState'
import { useFileTree } from './composables/useFileTree'
import { useSettings, applyTheme } from './composables/useSettings'
import { openPageTab } from './composables/useTabs'
import { IsFullscreen } from '../wailsjs/go/main/App'
import { setLocale } from './i18n'

const sidebarCollapsed = ref(false)
const showAIChat = ref(false)
provide('showAIChat', showAIChat)
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

provideEditorState()
const { openFolder, openFile, saveCurrentFile, newFile, restoreSession, openRecentFolder, openRecentFile, selectFile, switchToTab, closeFileTab, closeOtherTabs, closeAllTabs, dirtyTabs, handleExternalChange } = useFileTree()
const { loadSettings, theme, debugMode, rawMode } = useSettings()

onMounted(async () => {
  await loadSettings()
  applyTheme(theme.value)

  // __localeReady signals that the initial mount is complete,
  // regardless of whether Wails runtime is connected.
  // E2E tests that need Wails bindings mock them after this flag.
  ;(window as any).__localeReady = true
  // Expose setLocale for E2E tests to switch locale without Wails bindings
  ;(window as any).__setLocale = setLocale
  // Expose setRawMode for E2E tests to toggle raw mode without Wails bindings
  ;(window as any).__setRawMode = (v: boolean) => { rawMode.value = v }

  // HMR dev mode: Wails runtime may not be ready yet (window.go undefined),
  // causing LoadConfig() to fail silently. Retry when the runtime connects
  // so the UI picks up correct settings.
  if (!(window as any).go?.main?.App) {
    const timer = setInterval(() => {
      if ((window as any).go?.main?.App) {
        clearInterval(timer)
        loadSettings().then(() => {
          applyTheme(theme.value)
        })
      }
    }, 200)
    setTimeout(() => clearInterval(timer), 30000)
  }

  await restoreSession()
  checkFullscreen()
  window.addEventListener('resize', checkFullscreen)

  const pendingPath = await GetPendingOpenFile().catch(() => '')
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

  // Listen for external file changes detected by the backend watcher
  let fsChangeTimer: ReturnType<typeof setTimeout> | null = null
  EventsOff('fs:change')
  EventsOn('fs:change', () => {
    if (fsChangeTimer) clearTimeout(fsChangeTimer)
    fsChangeTimer = setTimeout(() => {
      handleExternalChange()
    }, 300)
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      saveCurrentFile()
    }
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

  EventsOff('menu:toggle-raw')
  EventsOn('menu:toggle-raw', (checked: boolean) => {
    rawMode.value = checked
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
        :dirty-paths="dirtyTabs"
        @switch="switchToTab"
        @close="closeFileTab"
        @close-other-tabs="closeOtherTabs"
        @close-all-tabs="closeAllTabs"
      />
      <div class="content-area">
        <AppEditor v-if="currentPage === 'editor'" />
        <AppSettings v-else-if="currentPage === 'settings'" />
        <RelationGraph v-else-if="currentPage === 'relations'" />
      </div>
      <AppStatusBar />
    </div>
    <AIChatPanel v-if="showAIChat" @close="showAIChat = false" @open-file="selectFile" />
    <AboutDialog :visible="aboutDialogVisible" @close="aboutDialogVisible = false" />
    <ConfirmDialog />
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
</style>
