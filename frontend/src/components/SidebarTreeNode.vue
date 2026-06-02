<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Folder, FolderOpen } from 'lucide-vue-next'
import type { TreeNode } from '../types/file'
import { ClipboardSetText, DeleteFile, ConfirmDelete } from '../../wailsjs/go/main/App'
import { copiedFilePath, pasteToDirectory } from '../composables/useFileTree'
import { useFileTree } from '../composables/useFileTree'

const { t } = useI18n()

const props = defineProps<{
  node: TreeNode
  selectedPath: string
  depth: number
  rootPath: string
}>()

const emit = defineEmits<{
  select: [node: TreeNode]
  refresh: [dirPath: string]
}>()

function getItemIcon(node: TreeNode) {
  if (node.isDir) return node.expanded ? FolderOpen : Folder
  return FileText
}

const indent = 8 + props.depth * 24

const menuVisible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const canPaste = computed(() => !!copiedFilePath.value)

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  menuX.value = e.clientX
  menuY.value = e.clientY
  menuVisible.value = true

  const closeMenu = () => {
    menuVisible.value = false
    document.removeEventListener('click', closeMenu)
    document.removeEventListener('scroll', closeMenu, true)
  }
  requestAnimationFrame(() => {
    document.addEventListener('click', closeMenu)
    document.addEventListener('scroll', closeMenu, true)
  })
}

async function copyName() {
  await ClipboardSetText(props.node.name)
  copiedFilePath.value = props.node.path
  menuVisible.value = false
}

async function copyPath() {
  await ClipboardSetText(props.node.path)
  menuVisible.value = false
}

async function copyRelativePath() {
  const root = props.rootPath.replace(/\/$/, '')
  let relative = props.node.path
  if (relative.startsWith(root + '/')) {
    relative = relative.slice(root.length + 1)
  }
  await ClipboardSetText(relative)
  menuVisible.value = false
}

async function deleteItem() {
  const confirmed = await ConfirmDelete(props.node.name, props.node.isDir)
  if (!confirmed) {
    menuVisible.value = false
    return
  }

  const parentDir = props.node.path.substring(0, props.node.path.lastIndexOf('/'))
  await DeleteFile(props.node.path)
  const { closeTabsForDeletedPath } = useFileTree()
  await closeTabsForDeletedPath(props.node.path, props.node.isDir)
  menuVisible.value = false
  emit('refresh', parentDir)
}

async function pasteHere() {
  const targetDir = props.node.isDir ? props.node.path : props.node.path.substring(0, props.node.path.lastIndexOf('/'))
  const success = await pasteToDirectory(targetDir)
  menuVisible.value = false
  if (success) {
    emit('refresh', targetDir)
  }
}
</script>

<template>
  <div
    class="tree-item"
    :class="{ active: node.path === selectedPath }"
    :style="{ paddingLeft: indent + 'px' }"
    @click="emit('select', node)"
    @contextmenu.prevent="onContextMenu"
  >
    <component
      :is="getItemIcon(node)"
      :size="depth === 0 ? 16 : 14"
      class="tree-item-icon"
    />
    <span class="tree-item-text">{{ node.name }}</span>
  </div>

  <Teleport to="body">
    <div
      v-if="menuVisible"
      class="tree-context-menu"
      :style="{ left: menuX + 'px', top: menuY + 'px' }"
    >
      <div class="menu-item" @click="copyName">{{ t('sidebar.contextMenu.copy') }}</div>
      <div class="menu-item" :class="{ disabled: !canPaste }" @click="canPaste && pasteHere()">{{ t('sidebar.contextMenu.paste') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="copyPath">{{ t('sidebar.contextMenu.copyPath') }}</div>
      <div class="menu-item" @click="copyRelativePath">{{ t('sidebar.contextMenu.copyRelativePath') }}</div>
      <div class="menu-divider" />
      <div class="menu-item" @click="deleteItem">{{ t('sidebar.contextMenu.delete') }}</div>
    </div>
  </Teleport>

  <template v-if="node.isDir && node.expanded">
    <SidebarTreeNode
      v-for="child in node.children"
      :key="child.path"
      :node="child"
      :selected-path="selectedPath"
      :depth="depth + 1"
      :root-path="rootPath"
      @select="emit('select', $event)"
      @refresh="emit('refresh', $event)"
    />
  </template>
</template>

<style scoped>
.tree-item {
  height: 30px;
  flex-shrink: 0;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  cursor: pointer;
  color: var(--foreground-secondary);
}

.tree-item:hover {
  background-color: var(--surface-hover);
}

.tree-item.active {
  background-color: var(--accent-primary);
  color: var(--foreground-inverse);
}

.tree-item.active .tree-item-icon {
  color: var(--foreground-inverse);
}

.tree-item-icon {
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.tree-item-text {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-item.active .tree-item-text {
  color: var(--foreground-inverse);
}
</style>

<style>
.tree-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background-color: var(--surface-sidebar);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.menu-item {
  padding: 6px 10px;
  font-size: 13px;
  color: var(--foreground-secondary);
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}

.menu-item:hover {
  background-color: var(--surface-hover);
  color: var(--foreground-primary);
}

.menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.menu-divider {
  height: 1px;
  background-color: var(--border-subtle);
  margin: 4px 0;
}
</style>
