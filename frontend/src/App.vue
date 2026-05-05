<script lang="ts" setup>
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Network, MessageSquare, GitBranch } from 'lucide-vue-next'
import { EventsOn, EventsOff, ClipboardGetText } from '../wailsjs/runtime/runtime'
import { GetPendingOpenFile, GitCheckInit, GitInit, GitPull, GitCommit, GitAutoCommit, GitPush, GitStatus } from '../wailsjs/go/main/App'
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
import { useConfirmDialog } from './composables/useConfirmDialog'
import { IsFullscreen } from '../wailsjs/go/main/App'
import { setLocale } from './i18n'

const sidebarCollapsed = ref(false)
const showAIChat = ref(false)
provide('showAIChat', showAIChat)
const isFullscreen = ref(false)
const aboutDialogVisible = ref(false)

const showSyncMenu = ref(false)
const syncBtnEl = ref<HTMLElement>()
const syncMenuX = ref(0)
const syncMenuY = ref(0)
const showCommitInput = ref(false)
const commitMsg = ref('')
const syncStatus = ref('')

function toggleSyncMenu() {
  showSyncMenu.value = !showSyncMenu.value
  if (showSyncMenu.value && syncBtnEl.value) {
    const rect = syncBtnEl.value.getBoundingClientRect()
    syncMenuX.value = rect.left
    syncMenuY.value = rect.bottom + 4
  }
  showCommitInput.value = false
  commitMsg.value = ''
  syncStatus.value = ''
}

async function handleGitPull() {
  try {
    const gitInit = await GitCheckInit()
    if (!gitInit) {
      syncStatus.value = t('editor.gitSync.initMessage')
      return
    }
    const result = await GitPull()
    const data = JSON.parse(result)
    if (data.error) {
      syncStatus.value = t('editor.gitSync.error', { error: data.error })
    } else {
      syncStatus.value = t('editor.gitSync.pullSuccess')
    }
  } catch (err) {
    syncStatus.value = t('editor.gitSync.error', { error: String(err) })
  }
}

async function handleGitCommit() {
  syncStatus.value = ''
  try {
    const gitInit = await GitCheckInit()
    if (!gitInit) {
      syncStatus.value = t('editor.gitSync.initMessage')
      return
    }
    const { autoCommit: ac } = useSettings()
    if (ac.value) {
      // Auto-commit with LLM
      const result = await GitAutoCommit()
      const data = JSON.parse(result)
      if (data.error) {
        syncStatus.value = t('editor.gitSync.error', { error: data.error })
      } else if (data.ok && data.message) {
        if (data.message === 'nothing to commit') {
          syncStatus.value = t('editor.gitSync.nothingToCommit')
        } else {
          syncStatus.value = t('editor.gitSync.commitSuccess', { message: data.message })
        }
        showSyncMenu.value = false
      } else if (data.ok) {
        syncStatus.value = t('editor.gitSync.commitSuccess', { message: '' })
        showSyncMenu.value = false
      }
    } else {
      // Show commit message input
      showCommitInput.value = true
      return
    }
  } catch (err) {
    syncStatus.value = t('editor.gitSync.error', { error: String(err) })
  }
}

async function submitCommit() {
  if (!commitMsg.value.trim()) return
  try {
    const result = await GitCommit(commitMsg.value.trim())
    const data = JSON.parse(result)
    if (data.error) {
      syncStatus.value = t('editor.gitSync.error', { error: data.error })
    } else {
      syncStatus.value = t('editor.gitSync.commitSuccess', { message: commitMsg.value.trim() })
    }
  } catch (err) {
    syncStatus.value = t('editor.gitSync.error', { error: String(err) })
  }
  showSyncMenu.value = false
}

async function handleGitPush() {
  try {
    const gitInit = await GitCheckInit()
    if (!gitInit) {
      syncStatus.value = t('editor.gitSync.initMessage')
      return
    }

    // If auto-commit is enabled, commit first then push
    const { autoCommit: ac } = useSettings()
    if (ac.value) {
      const commitResult = await GitAutoCommit()
      const commitData = JSON.parse(commitResult)
      if (!commitData.ok && commitData.error) {
        syncStatus.value = t('editor.gitSync.error', { error: commitData.error })
        return
      }
    }

    const result = await GitPush()
    const data = JSON.parse(result)
    if (data.error) {
      syncStatus.value = t('editor.gitSync.error', { error: data.error })
    } else {
      syncStatus.value = t('editor.gitSync.pushSuccess')
    }
  } catch (err) {
    syncStatus.value = t('editor.gitSync.error', { error: String(err) })
  }
}

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
const { openFolder, openFile, saveCurrentFile, newFile, restoreSession, openRecentFolder, openRecentFile, selectFile, switchToTab, closeFileTab, closeOtherTabs, closeAllTabs, dirtyTabs, rootPath } = useFileTree()
const { loadSettings, theme, debugMode, autoPull, defaultBranch } = useSettings()

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

  // Auto-pull on startup if configured
  if (autoPull.value && rootPath.value) {
    try {
      const isInit = await GitCheckInit()
      if (isInit) {
        await GitPull()
      }
    } catch {
      // silent fail on auto-pull
    }
  }
})

// Watch for workspace path changes to check git init
watch(rootPath, async (newPath) => {
  if (!newPath) return
  try {
    const isInit = await GitCheckInit()
    if (!isInit) {
      const { confirm } = useConfirmDialog()
      const shouldInit = await confirm({
        title: t('editor.gitSync.initTitle'),
        message: t('editor.gitSync.initMessage'),
        confirmText: t('editor.gitSync.initConfirm'),
        cancelText: t('editor.gitSync.initCancel'),
      })
      if (shouldInit) {
        await GitInit(defaultBranch.value)
      }
    }
  } catch {
    // silent fail on git check
  }
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
        <div class="floating-actions">
          <div ref="syncBtnEl" class="sync-btn-wrapper">
            <button
              class="floating-btn"
              :class="{ active: showSyncMenu }"
              title="Git Sync"
              @click.stop="toggleSyncMenu"
            >
              <GitBranch :size="18" />
            </button>
            <Teleport to="body">
              <div
                v-if="showSyncMenu"
                class="sync-menu-overlay"
                @click="showSyncMenu = false"
                @contextmenu.prevent="showSyncMenu = false"
              >
                <div
                  class="sync-menu"
                  :style="{ left: syncMenuX + 'px', top: syncMenuY + 'px' }"
                  @click.stop
                >
                  <div v-if="syncStatus" class="sync-status">{{ syncStatus }}</div>
                  <template v-if="showCommitInput">
                    <div class="sync-commit-input-row">
                      <input
                        v-model="commitMsg"
                        class="sync-commit-input"
                        :placeholder="t('editor.gitSync.commitMessage')"
                        @keydown.enter="submitCommit"
                      />
                    </div>
                    <div class="sync-menu-item" @click="submitCommit">
                      {{ t('editor.gitSync.commit') }}
                    </div>
                  </template>
                  <template v-else>
                    <div class="sync-menu-item" @click="handleGitPull">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                        <path d="M21 3v5h-5" />
                        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                        <path d="M8 16H3v5" />
                      </svg>
                      {{ t('editor.gitSync.pull') }}
                    </div>
                    <div class="sync-menu-item" @click="handleGitCommit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 3v6" />
                        <path d="M12 15v6" />
                      </svg>
                      {{ t('editor.gitSync.commit') }}
                    </div>
                    <div class="sync-menu-item" @click="handleGitPush">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                      {{ t('editor.gitSync.push') }}
                    </div>
                  </template>
                </div>
              </div>
            </Teleport>
          </div>
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

.sync-btn-wrapper {
  display: flex;
  align-items: center;
  --wails-draggable: no-drag;
}

.sync-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.sync-menu {
  position: fixed;
  min-width: 140px;
  background: var(--surface-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.sync-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--foreground-primary);
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.sync-menu-item:hover {
  background: var(--accent-primary);
  color: #fff;
}

.sync-menu-item:hover svg {
  color: #fff;
}

.sync-menu-item svg {
  color: var(--foreground-secondary);
  flex-shrink: 0;
}

.sync-status {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--foreground-tertiary);
  border-bottom: 1px solid var(--border-secondary);
  margin-bottom: 4px;
  word-break: break-all;
}

.sync-commit-input-row {
  padding: 4px 8px;
}

.sync-commit-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  background: var(--surface-secondary);
  color: var(--foreground-primary);
  outline: none;
}

.sync-commit-input:focus {
  border-color: var(--accent-primary);
}
</style>
