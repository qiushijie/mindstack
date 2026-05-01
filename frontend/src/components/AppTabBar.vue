<script lang="ts" setup>
import { FileText, X, MessageSquare } from 'lucide-vue-next'
import { useTabs } from '../composables/useTabs'

defineProps<{
  aiActive?: boolean
}>()

const emit = defineEmits<{
  switch: [index: number]
  close: [index: number]
  'toggle-ai': []
}>()

const { tabs, activeTabIndex } = useTabs()

function handleTabClick(index: number) {
  if (index !== activeTabIndex.value) {
    emit('switch', index)
  }
}

function handleClose(index: number, e: MouseEvent) {
  e.stopPropagation()
  emit('close', index)
}
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.path"
      class="tab-item"
      :class="{ active: index === activeTabIndex }"
      @click="handleTabClick(index)"
    >
      <FileText :size="14" class="tab-icon" />
      <span class="tab-title">{{ tab.title }}</span>
      <button class="tab-close" @click="handleClose(index, $event)">
        <X :size="14" />
      </button>
    </div>
    <div class="tab-spacer" />
    <button class="ai-btn" :class="{ active: aiActive }" @click="emit('toggle-ai')" title="AI Assistant">
      <MessageSquare :size="20" />
    </button>
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
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  cursor: pointer;
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

.tab-spacer {
  flex: 1;
}

.ai-btn {
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

.ai-btn:hover {
  color: var(--foreground-secondary);
  background: var(--surface-hover);
}

.ai-btn.active {
  color: var(--accent-primary);
  background: var(--surface-hover);
}
</style>
