<script lang="ts" setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { FileText, X, Settings, Minus, Square, Network, GitCompare, Check } from 'lucide-vue-next'
import { useTabs, isPageTab } from '../composables/useTabs'
import { useSettings } from '../composables/useSettings'
import { useDiffView } from '../composables/useDiffView'
import { useAIEdit } from '../composables/useAIEdit'
import { useFileTree } from '../composables/useFileTree'
import { t } from '../i18n'
import {
  WindowClose,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/go/main/App'

const props = defineProps<{
  dirtyPaths?: string[]
}>()

const emit = defineEmits<{
  switch: [index: number]
  close: [index: number]
  closeOtherTabs: [index: number]
  closeAllTabs: []
}>()

const { tabs, activeTabIndex, activeTab } = useTabs()
const { uiPlatform } = useSettings()
const { acceptAll, rejectAll, getAppliedContent, hasChanges, closeDiffView } = useDiffView()
const { applyEdit } = useAIEdit()
const { selectedFileContent } = useFileTree()

const isDiffActive = computed(() => activeTab.value?.path === 'diff')

function handleAcceptAll() {
  acceptAll()
  const content = getAppliedContent()
  closeDiffView()
  nextTick(() => {
    selectedFileContent.value = content
    applyEdit(content, false)
  })
}

function handleRejectAll() {
  rejectAll()
  closeDiffView()
}

const tabBarRef = ref<HTMLElement | null>(null)

const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuIndex = ref(0)

let escKeyHandler: ((e: KeyboardEvent) => void) | null = null

function showContextMenu(index: number, e: MouseEvent) {
  e.preventDefault()
  contextMenuIndex.value = index
  const menuWidth = 160
  const menuHeight = 120
  const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8)
  contextMenuX.value = Math.max(8, x)
  contextMenuY.value = Math.max(8, y)
  contextMenuVisible.value = true
  escKeyHandler = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') closeContextMenu()
  }
  document.addEventListener('keydown', escKeyHandler)
}

function closeContextMenu() {
  contextMenuVisible.value = false
  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler)
    escKeyHandler = null
  }
}

function handleContextMenuClose() {
  emit('close', contextMenuIndex.value)
  closeContextMenu()
}

function handleContextMenuCloseOthers() {
  emit('closeOtherTabs', contextMenuIndex.value)
  closeContextMenu()
}

function handleContextMenuCloseAll() {
  emit('closeAllTabs')
  closeContextMenu()
}

function onTabMouseDown(e: MouseEvent) {
  if (e.button === 2) {
    e.preventDefault()
  }
}

function scrollActiveTabIntoView() {
  if (!tabBarRef.value) return
  const el = tabBarRef.value.children[activeTabIndex.value] as HTMLElement | undefined
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }
}

watch(activeTabIndex, () => {
  nextTick(scrollActiveTabIntoView)
})

function handleTabClick(index: number) {
  if (index !== activeTabIndex.value) {
    emit('switch', index)
  }
}

function handleClose(index: number, e: MouseEvent) {
  e.stopPropagation()
  emit('close', index)
}

async function onWindowClose() {
  await WindowClose()
}

async function onWindowMinimise() {
  await WindowMinimise()
}

async function onWindowToggleMaximise() {
  await WindowToggleMaximise()
}

onBeforeUnmount(() => {
  if (escKeyHandler) {
    document.removeEventListener('keydown', escKeyHandler)
    escKeyHandler = null
  }
})
</script>

<template>
  <div ref="tabBarRef" class="tab-bar">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.path"
      class="tab-item"
      :class="{ active: index === activeTabIndex }"
      @click="handleTabClick(index)"
      @contextmenu.prevent="showContextMenu(index, $event)"
      @mousedown="onTabMouseDown($event)"
      @selectstart.prevent
    >
      <FileText v-if="!isPageTab(tab.path)" :size="14" class="tab-icon" />
      <Settings v-else-if="tab.path === 'settings'" :size="14" class="tab-icon" />
      <Network v-else-if="tab.path === 'relations'" :size="14" class="tab-icon" />
      <GitCompare v-else-if="tab.path === 'diff'" :size="14" class="tab-icon" />
      <span class="tab-title">{{ tab.title }}</span>
      <span v-if="dirtyPaths?.includes(tab.path)" class="tab-dirty-dot" />
      <button class="tab-close" @click="handleClose(index, $event)">
        <X :size="14" />
      </button>
    </div>
    <div class="tab-bar-spacer" />
    <div v-if="isDiffActive && hasChanges" class="diff-actions">
      <button class="action-btn accept-all" @click="handleAcceptAll">
        <Check :size="12" />
        Accept All
      </button>
      <button class="action-btn reject-all" @click="handleRejectAll">
        <X :size="12" />
        Reject All
      </button>
    </div>
    <div v-if="uiPlatform === 'windows'" class="window-controls">
      <button class="win-btn" title="Minimise" @click="onWindowMinimise">
        <Minus :size="10" />
      </button>
      <button class="win-btn" title="Maximise" @click="onWindowToggleMaximise">
        <Square :size="10" />
      </button>
      <button class="win-btn close" title="Close" @click="onWindowClose">
        <X :size="10" />
      </button>
    </div>
    <Teleport to="body">
      <div
        v-if="contextMenuVisible"
        class="context-menu-overlay"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="context-menu"
          :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
          @click.stop
        >
          <div class="context-menu-item" @click="handleContextMenuClose">
            {{ t('editor.tabContextMenu.closeCurrent') }}
          </div>
          <div class="context-menu-item" @click="handleContextMenuCloseOthers">
            {{ t('editor.tabContextMenu.closeOthers') }}
          </div>
          <div class="context-menu-item" @click="handleContextMenuCloseAll">
            {{ t('editor.tabContextMenu.closeAll') }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background-color: var(--surface-secondary);
  padding: 0 8px;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
  --wails-draggable: drag;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  --wails-draggable: no-drag;
}

.tab-item .tab-icon {
  color: var(--foreground-tertiary);
  flex-shrink: 0;
}

.tab-item .tab-title {
  font-size: 13px;
  font-weight: normal;
  color: var(--foreground-tertiary);
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-user-select: none;
  user-select: none;
}

.tab-item .tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.tab-dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--foreground-tertiary);
  flex-shrink: 0;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background-color: var(--surface-hover);
}

.tab-item.active .tab-icon {
  color: var(--foreground-secondary);
}

.tab-item.active .tab-title {
  color: var(--foreground-primary);
  font-weight: 500;
}

.tab-item.active .tab-close {
  opacity: 1;
}

.tab-item.active {
  background-color: var(--surface-primary);
}

.tab-bar-spacer {
  flex: 1;
  min-width: 0;
}

.diff-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 8px;
  --wails-draggable: no-drag;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  font-family: var(--font-sans);
}

.action-btn.accept-all {
  background: #22C55E;
  color: #fff;
}

.action-btn.accept-all:hover {
  background: #16A34A;
}

.action-btn.reject-all {
  background: #FF4444;
  color: #fff;
}

.action-btn.reject-all:hover {
  background: #DC2626;
}

.action-btn.apply {
  background: var(--accent-primary);
  color: var(--foreground-inverse);
}

.action-btn.apply:hover {
  background: var(--accent-hover);
}

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  --wails-draggable: no-drag;
}

.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 100%;
  border: none;
  background: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
}

.win-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.win-btn.close:hover {
  background-color: #e81123;
  color: #fff;
}

.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
}

.context-menu {
  position: fixed;
  min-width: 140px;
  background: var(--surface-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.context-menu-item {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--foreground-primary);
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
}

.context-menu-item:hover {
  background: var(--accent-primary);
  color: #fff;
}

.context-menu-item:active {
  background: var(--accent-secondary);
}
</style>
