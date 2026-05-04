<script lang="ts" setup>
import { useConfirmDialog } from '../composables/useConfirmDialog'

const { visible, options, handleConfirm, handleCancel } = useConfirmDialog()

function onOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('confirm-dialog-overlay')) {
    handleCancel()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value) {
    handleCancel()
  }
}

import { onMounted, onUnmounted } from 'vue'
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="confirm-dialog-overlay" @mousedown="onOverlayClick">
      <div class="confirm-dialog">
        <div class="confirm-dialog-header">{{ options.title }}</div>
        <div class="confirm-dialog-body">{{ options.message }}</div>
        <div class="confirm-dialog-footer">
          <button class="btn btn-cancel" @click="handleCancel">{{ options.cancelText }}</button>
          <button class="btn btn-confirm" @click="handleConfirm">{{ options.confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.confirm-dialog {
  width: 340px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.confirm-dialog-header {
  padding: 16px 20px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.confirm-dialog-body {
  padding: 8px 20px 20px;
  font-size: 13px;
  color: var(--foreground-secondary);
  line-height: 1.5;
}

.confirm-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  font-weight: 500;
}

.btn-cancel {
  background: var(--surface-hover);
  color: var(--foreground-primary);
}

.btn-cancel:hover {
  background: var(--border-secondary);
}

.btn-confirm {
  background: var(--accent-primary);
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
