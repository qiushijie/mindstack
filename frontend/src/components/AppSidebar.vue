<script lang="ts" setup>
import {
  Plus,
  Search,
} from 'lucide-vue-next'
import { useFileTree } from '../composables/useFileTree'
import type { TreeNode } from '../types/file'
import SidebarTreeNode from './SidebarTreeNode.vue'

const { rootPath, treeData, selectedFilePath, folderName, selectFile, toggleDir, newFile, openFolder } = useFileTree()

function handleItemClick(node: TreeNode) {
  if (node.isDir) {
    toggleDir(node.path)
  } else {
    selectFile(node.path)
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-logo">{{ folderName }}</span>
      <button class="sidebar-new-btn" @click="newFile">
        <Plus :size="20" />
      </button>
    </div>

    <div class="sidebar-search">
      <div class="search-box">
        <Search :size="14" class="search-icon" />
        <span class="search-placeholder">Search...</span>
      </div>
    </div>

    <div class="sidebar-divider" />

    <div v-if="!rootPath" class="sidebar-empty">
      <span class="empty-text">Open a folder to get started</span>
    </div>

    <div v-else class="sidebar-tree">
      <span class="section-label">WORKSPACE</span>
      <SidebarTreeNode
        v-for="node in treeData"
        :key="node.path"
        :node="node"
        :selected-path="selectedFilePath"
        :depth="0"
        @select="handleItemClick"
      />
    </div>
  </aside>
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
