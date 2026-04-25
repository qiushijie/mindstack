<script lang="ts" setup>
import { onMounted } from 'vue'
import { EventsOn, ClipboardGetText } from '../wailsjs/runtime/runtime'
import AppSidebar from './components/AppSidebar.vue'
import AppEditor from './components/AppEditor.vue'
import AppStatusBar from './components/AppStatusBar.vue'
import AppSettings from './components/AppSettings.vue'
import { useNavigation } from './composables/useNavigation'
import { provideEditorState } from './composables/useEditorState'
import { useFileTree } from './composables/useFileTree'
import { useSettings } from './composables/useSettings'

const { currentPage, navigateTo } = useNavigation()
provideEditorState()
const { openFolder, openFile, saveCurrentFile, newFile, restoreSession } = useFileTree()
const { loadSettings } = useSettings()

onMounted(async () => {
  await loadSettings()
  restoreSession()

  EventsOn('menu:navigate', (page: string) => {
    if (page === 'settings' || page === 'editor') {
      navigateTo(page)
    }
  })

  EventsOn('menu:file:open', () => {
    openFolder()
  })

  EventsOn('menu:file:open-file', () => {
    openFile()
  })

  EventsOn('menu:file:save', () => {
    saveCurrentFile()
  })

  EventsOn('menu:file:new', () => {
    newFile()
  })

  EventsOn('menu:edit:cut', () => {
    document.execCommand('cut')
  })

  EventsOn('menu:edit:copy', () => {
    document.execCommand('copy')
  })

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
})
</script>

<template>
  <div class="app-layout">
    <AppSidebar v-if="currentPage === 'editor'" />
    <div class="app-content">
      <template v-if="currentPage === 'editor'">
        <AppEditor />
        <AppStatusBar />
      </template>
      <AppSettings v-else-if="currentPage === 'settings'" />
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background-color: var(--surface-primary);
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
