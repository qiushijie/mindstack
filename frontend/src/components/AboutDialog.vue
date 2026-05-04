<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('about-dialog-overlay')) {
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="about-dialog-overlay" @mousedown="handleOverlayClick">
      <div class="about-dialog">
        <div class="about-dialog-header">
          <span class="about-dialog-title">{{ t('settings.section.about') }}</span>
          <button class="about-dialog-close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
          </button>
        </div>
        <div class="about-dialog-content">
          <span class="about-app-name">{{ t('settings.about.name') }}</span>
          <span class="about-app-version">{{ t('settings.about.version') }}</span>
          <div class="about-sep" />
          <p class="about-desc">{{ t('settings.about.desc') }}</p>
        </div>
    </div>
    </div>
  </Teleport>
</template>

<style scoped>
.about-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.about-dialog {
  width: 360px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.about-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.about-dialog-title {
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--foreground-primary);
}

.about-dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--foreground-tertiary);
}

.about-dialog-close:hover {
  background: var(--surface-hover);
  color: var(--foreground-secondary);
}

.about-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 24px 32px;
  text-align: center;
}

.about-app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.about-app-version {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground-tertiary);
}

.about-sep {
  width: 100%;
  height: 1px;
  background-color: var(--border-subtle);
  margin: 4px 0;
}

.about-desc {
  font-size: 13px;
  color: var(--foreground-secondary);
  line-height: 1.5;
  margin: 0;
}

</style>
