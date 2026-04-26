<script lang="ts" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from 'lucide-vue-next'
import { useFileTree, copiedFilePath, resolveUniqueFilePath, resolvePasteFilePath } from '../composables/useFileTree'
import { ClipboardGetText, SaveFileContent, ReadFileContent, FileExists } from '../../wailsjs/go/main/App'
import type { TreeNode } from '../types/file'
import SidebarTreeNode from './SidebarTreeNode.vue'

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

const { t } = useI18n()
const { rootPath, treeData, selectedFilePath, folderName, selectFile, toggleDir, openFolder, refreshTree, refreshDir } = useFileTree()

function toggleCollapse() {
  emit('update:collapsed', !props.collapsed)
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

  // Priority: duplicate internally copied file
  if (copiedFilePath.value) {
    const content = await ReadFileContent(copiedFilePath.value)
    const sourceName = copiedFilePath.value.split('/').pop() || 'file.md'
    const targetPath = await resolveUniqueFilePath(rootPath.value, sourceName, FileExists)
    await SaveFileContent(targetPath, content)
    treeMenuVisible.value = false
    await refreshTree()
    return
  }

  // Fallback: create file from clipboard text
  const text = await ClipboardGetText()
  if (!text) {
    treeMenuVisible.value = false
    return
  }

  const { path: filePath, content } = await resolvePasteFilePath(rootPath.value, text, FileExists)
  await SaveFileContent(filePath, content)
  treeMenuVisible.value = false
  await refreshTree()
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
      <span v-if="!props.collapsed" class="sidebar-logo">{{ folderName }}</span>
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

      <div v-else class="sidebar-tree" @contextmenu.prevent="onTreeContextMenu">
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
}

.sidebar-logo {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.sidebar-new-btn {
  background: none;
  border: none;
  color: var(--foreground-tertiary);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
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
</style>
