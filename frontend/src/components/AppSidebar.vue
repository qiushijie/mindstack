<script lang="ts" setup>
import {
  Plus,
  Search,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-vue-next'

interface FileItem {
  name: string
  icon: 'file' | 'folder' | 'folder-open'
  indent?: number
  active?: boolean
}

interface FileSection {
  label: string
  items: FileItem[]
}

const sections: FileSection[] = [
  {
    label: 'FAVORITES',
    items: [
      { name: 'Getting Started', icon: 'file', active: true },
      { name: 'Project Overview', icon: 'file' },
      { name: 'Architecture Notes', icon: 'file' },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Documentation', icon: 'folder' },
      { name: 'API Reference', icon: 'folder-open' },
      { name: 'Authentication', icon: 'file', indent: 1 },
      { name: 'Endpoints', icon: 'file', indent: 1 },
      { name: 'Technical Specs', icon: 'folder' },
      { name: 'Meeting Notes', icon: 'folder' },
    ],
  },
]

function getItemIcon(icon: string) {
  switch (icon) {
    case 'folder': return Folder
    case 'folder-open': return FolderOpen
    default: return FileText
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <span class="sidebar-logo">MindStack</span>
      <button class="sidebar-new-btn">
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

    <div class="sidebar-tree">
      <template v-for="section in sections" :key="section.label">
        <span class="section-label">{{ section.label }}</span>
        <div
          v-for="item in section.items"
          :key="item.name"
          class="tree-item"
          :class="{ active: item.active }"
          :style="{ paddingLeft: item.indent ? '32px' : '8px' }"
        >
          <component
            :is="getItemIcon(item.icon)"
            :size="item.indent ? 14 : 16"
            class="tree-item-icon"
          />
          <span class="tree-item-text">{{ item.name }}</span>
        </div>
      </template>
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

.tree-item {
  height: 30px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-sm);
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
