<script lang="ts" setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  List,
  Heading,
} from 'lucide-vue-next'
import { useFileTree, copiedFilePath, pasteToDirectory } from '../composables/useFileTree'
import { useSettings } from '../composables/useSettings'
import {
  WindowClose,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/go/main/App'
import { useHeadingTree, setCurrentHeadings } from '../composables/useHeadingTree'
import { scrollToLine } from '../composables/useEditorState'
import type { TreeNode } from '../types/file'
import SidebarTreeNode from './SidebarTreeNode.vue'
import HeadingOutline from './HeadingOutline.vue'

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

const { t } = useI18n()
const { rootPath, treeData, selectedFilePath, selectedFileContent, selectFile, toggleDir, openFolder, refreshTree, refreshDir } = useFileTree()
const { uiPlatform } = useSettings()
const { headings, selectedHeadingLine } = useHeadingTree()

type ViewMode = 'file' | 'heading'
const VIEW_MODE_KEY = 'mindstack:sidebarViewMode'
const viewMode = ref<ViewMode>((localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'file')

let headingDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(selectedFileContent, (content) => {
  if (headingDebounceTimer) clearTimeout(headingDebounceTimer)
  headingDebounceTimer = setTimeout(() => {
    setCurrentHeadings(content)
  }, 150)
}, { immediate: true })

watch(viewMode, (mode) => {
  localStorage.setItem(VIEW_MODE_KEY, mode)
})

function toggleViewMode() {
  viewMode.value = viewMode.value === 'file' ? 'heading' : 'file'
}

function handleHeadingSelect(line: number) {
  scrollToLine(line)
}

function toggleCollapse() {
  emit('update:collapsed', !props.collapsed)
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

function handleItemClick(node: TreeNode) {
  if (node.isDir) {
    toggleDir(node.path)
  } else {
    selectFile(node.path)
  }
}

const treeMenuVisible = ref(false)
const treeMenuX = ref(0)
const treeMenuY = ref(0)
const canTreePaste = () => !!copiedFilePath.value || false

function onTreeContextMenu(e: MouseEvent) {
  e.preventDefault()
  treeMenuX.value = e.clientX
  treeMenuY.value = e.clientY
  treeMenuVisible.value = true

  const closeMenu = () => {
    treeMenuVisible.value = false
    document.removeEventListener('click', closeMenu)
    document.removeEventListener('scroll', closeMenu, true)
  }
  requestAnimationFrame(() => {
    document.addEventListener('click', closeMenu)
    document.addEventListener('scroll', closeMenu, true)
  })
}

async function pasteToRoot() {
  if (!rootPath.value) {
    treeMenuVisible.value = false
    return
  }

  const success = await pasteToDirectory(rootPath.value)
  treeMenuVisible.value = false
  if (success) {
    await refreshTree()
  }
}

async function handleRefresh(dirPath: string) {
  if (dirPath === rootPath.value) {
    await refreshTree()
  } else {
    await refreshDir(dirPath)
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: props.collapsed }">
    <div class="sidebar-header">
      <div v-if="uiPlatform === 'macos'" class="window-controls">
        <button class="win-btn macos close" title="Close" @click="onWindowClose" />
        <button class="win-btn macos minimise" title="Minimise" @click="onWindowMinimise" />
        <button class="win-btn macos maximise" title="Maximise" @click="onWindowToggleMaximise" />
      </div>
      <button class="sidebar-new-btn" @click="toggleCollapse">
        <PanelLeftClose v-if="!props.collapsed" :size="18" />
        <PanelLeftOpen v-else :size="18" />
      </button>
    </div>

    <template v-if="!props.collapsed">
      <div class="sidebar-search">
        <div class="search-box">
          <Search :size="14" class="search-icon" />
          <span class="search-placeholder">{{ t('sidebar.searchPlaceholder') }}</span>
        </div>
      </div>

      <div class="sidebar-divider" />

      <div v-if="!rootPath" class="sidebar-empty">
        <span class="empty-text">{{ t('sidebar.emptyHint') }}</span>
      </div>

      <div v-else class="sidebar-tree">
        <template v-if="viewMode === 'file'">
          <div class="file-tree-content" @contextmenu.prevent="onTreeContextMenu">
            <span class="section-label">{{ t('sidebar.workspace') }}</span>
            <SidebarTreeNode
              v-for="node in treeData"
              :key="node.path"
              :node="node"
              :selected-path="selectedFilePath"
              :depth="0"
              :root-path="rootPath"
              @select="handleItemClick"
              @refresh="handleRefresh"
            />
          </div>
        </template>
        <template v-else>
          <HeadingOutline
            :headings="headings"
            :selected-line="selectedHeadingLine"
            @select="handleHeadingSelect"
          />
        </template>
      </div>

      <div v-if="rootPath" class="sidebar-view-toggle">
        <button
          class="view-toggle-btn"
          :title="viewMode === 'file' ? t('sidebar.switchToHeadings') : t('sidebar.switchToFiles')"
          @click="toggleViewMode"
        >
          <List v-if="viewMode === 'heading'" :size="16" />
          <Heading v-else :size="16" />
        </button>
      </div>
    </template>
  </aside>

  <Teleport to="body">
    <div
      v-if="treeMenuVisible"
      class="tree-context-menu"
      :style="{ left: treeMenuX + 'px', top: treeMenuY + 'px' }"
    >
      <div class="menu-item disabled">{{ t('sidebar.contextMenu.copy') }}</div>
      <div class="menu-item" :class="{ disabled: !canTreePaste() }" @click="canTreePaste() && pasteToRoot()">{{ t('sidebar.contextMenu.paste') }}</div>
      <div class="menu-divider" />
      <div class="menu-item disabled">{{ t('sidebar.contextMenu.copyPath') }}</div>
      <div class="menu-item disabled">{{ t('sidebar.contextMenu.copyRelativePath') }}</div>
      <div class="menu-divider" />
      <div class="menu-item disabled">{{ t('sidebar.contextMenu.delete') }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background-color: var(--surface-sidebar);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  user-select: none;
  transition: width 0.25s ease;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 44px;
}

.sidebar.collapsed .sidebar-header {
  padding: 0;
  justify-content: center;
}

.sidebar-header {
  height: var(--sidebar-header-height);
  padding: 0 var(--spacing-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  --wails-draggable: drag;
}

.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  --wails-draggable: no-drag;
}

.window-controls.win-style {
  gap: 0;
}

.sidebar.collapsed .window-controls {
  gap: 4px;
}

.sidebar.collapsed .win-btn.macos.minimise,
.sidebar.collapsed .win-btn.macos.maximise {
  display: none;
}

.win-btn {
  border: none;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.win-btn.macos {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: opacity 0.15s;
}

.win-btn.macos.close {
  background-color: #FF5F57;
}

.win-btn.macos.minimise {
  background-color: #FEBC2E;
}

.win-btn.macos.maximise {
  background-color: #28C840;
}

.win-btn.windows {
  width: 28px;
  height: 28px;
  color: var(--foreground-tertiary);
  background: none;
  border-radius: 4px;
}

.win-btn.windows:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.win-btn.windows.close:hover {
  background-color: #e81123;
  color: #fff;
}

.sidebar-new-btn {
  --wails-draggable: no-drag;
  background: none;
  border: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  margin-left: auto;
}

.sidebar-new-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}

.sidebar-search {
  padding: var(--spacing-sm) var(--spacing-md);
}

.search-box {
  height: 34px;
  background-color: var(--surface-hover);
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-md);
}

.search-icon {
  color: var(--foreground-tertiary);
  flex-shrink: 0;
}

.search-placeholder {
  font-size: 13px;
  color: var(--foreground-tertiary);
}

.sidebar-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.sidebar-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-lg);
}

.empty-text {
  font-size: 13px;
  color: var(--foreground-tertiary);
  text-align: center;
}

.sidebar-tree {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.file-tree-content {
  flex: 1;
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--foreground-tertiary);
  letter-spacing: 0.5px;
  padding: 4px var(--spacing-sm);
}

.sidebar-view-toggle {
  height: 32px;
  padding: 0 var(--spacing-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.view-toggle-btn {
  background: none;
  border: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.view-toggle-btn:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-secondary);
}
</style>
