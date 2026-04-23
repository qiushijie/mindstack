<script lang="ts" setup>
import { FileText, Folder, FolderOpen } from 'lucide-vue-next'
import type { TreeNode } from '../types/file'

const props = defineProps<{
  node: TreeNode
  selectedPath: string
  depth: number
}>()

const emit = defineEmits<{
  select: [node: TreeNode]
}>()

function getItemIcon(node: TreeNode) {
  if (node.isDir) return node.expanded ? FolderOpen : Folder
  return FileText
}

const indent = 8 + props.depth * 24
</script>

<template>
  <div
    class="tree-item"
    :class="{ active: node.path === selectedPath }"
    :style="{ paddingLeft: indent + 'px' }"
    @click="emit('select', node)"
  >
    <component
      :is="getItemIcon(node)"
      :size="depth === 0 ? 16 : 14"
      class="tree-item-icon"
    />
    <span class="tree-item-text">{{ node.name }}</span>
  </div>
  <template v-if="node.isDir && node.expanded">
    <SidebarTreeNode
      v-for="child in node.children"
      :key="child.path"
      :node="child"
      :selected-path="selectedPath"
      :depth="depth + 1"
      @select="emit('select', $event)"
    />
  </template>
</template>

<style scoped>
.tree-item {
  height: 30px;
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
