<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import { EventsOn } from '../wailsjs/runtime/runtime'
import AppSidebar from './components/AppSidebar.vue'
import AppEditor from './components/AppEditor.vue'
import AppStatusBar from './components/AppStatusBar.vue'
import AppSettings from './components/AppSettings.vue'
import { useNavigation } from './composables/useNavigation'

const { currentPage, navigateTo } = useNavigation()

onMounted(() => {
  EventsOn('menu:navigate', (page: string) => {
    if (page === 'settings' || page === 'editor') {
      navigateTo(page)
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
