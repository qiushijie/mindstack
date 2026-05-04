<script lang="ts" setup>
import { ref, watch, nextTick } from 'vue'
import { FileText, X, Settings, Minus, Square, Network } from 'lucide-vue-next'
import { useTabs, isPageTab } from '../composables/useTabs'
import { useSettings } from '../composables/useSettings'
import {
  WindowClose,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/go/main/App'

const emit = defineEmits<{
  switch: [index: number]
  close: [index: number]
}>()

const { tabs, activeTabIndex } = useTabs()
const { uiPlatform } = useSettings()

const tabBarRef = ref<HTMLElement | null>(null)

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
</script>

<template>
  <div ref="tabBarRef" class="tab-bar">
    <div
      v-for="(tab, index) in tabs"
      :key="tab.path"
      class="tab-item"
      :class="{ active: index === activeTabIndex }"
      @click="handleTabClick(index)"
    >
      <FileText v-if="!isPageTab(tab.path)" :size="14" class="tab-icon" />
      <Settings v-else-if="tab.path === 'settings'" :size="14" class="tab-icon" />
      <Network v-else-if="tab.path === 'relations'" :size="14" class="tab-icon" />
      <span class="tab-title">{{ tab.title }}</span>
      <button class="tab-close" @click="handleClose(index, $event)">
        <X :size="14" />
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

.window-controls {
  display: flex;
  align-items: center;
  height: 100%;
  margin-left: auto;
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
</style>
