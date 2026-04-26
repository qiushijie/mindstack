<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { OpenImageFileDialog } from '../../wailsjs/go/main/App'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  initialUrl?: string
  initialAlt?: string
  editingFrom?: number
  editingTo?: number
  currentFilePath?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [payload: { url: string; alt: string; editingFrom?: number; editingTo?: number }]
}>()

const urlValue = ref('')
const altValue = ref('')
const isDragOver = ref(false)
const urlInputRef = ref<HTMLInputElement | null>(null)

const canInsert = computed(() => urlValue.value.trim().length > 0)

watch(() => props.visible, (val) => {
  if (val) {
    urlValue.value = props.initialUrl ?? ''
    altValue.value = props.initialAlt ?? ''
    nextTick(() => urlInputRef.value?.focus())
  }
})

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('image-dialog-overlay')) {
    emit('close')
  }
}

function handleClose() {
  urlValue.value = ''
  altValue.value = ''
  isDragOver.value = false
  emit('close')
}

function handleInsert() {
  if (!canInsert.value) return
  emit('confirm', {
    url: urlValue.value.trim(),
    alt: altValue.value.trim(),
    editingFrom: props.editingFrom,
    editingTo: props.editingTo,
  })
  urlValue.value = ''
  altValue.value = ''
}

function applyFile(absolutePath: string) {
  const relativeUrl = toRelativePath(absolutePath, props.currentFilePath ?? '')
  urlValue.value = relativeUrl
  if (!altValue.value) {
    const fileName = absolutePath.split('/').pop() ?? ''
    altValue.value = fileName.replace(/\.[^.]+$/, '')
  }
}

function toRelativePath(target: string, baseFilePath: string): string {
  if (!target) return target
  if (!baseFilePath) return target
  const slashIdx = baseFilePath.lastIndexOf('/')
  if (slashIdx < 0) return target
  const baseDir = baseFilePath.substring(0, slashIdx)
  const baseParts = baseDir.split('/')
  const targetParts = target.split('/')

  let i = 0
  while (i < baseParts.length && i < targetParts.length && baseParts[i] === targetParts[i]) {
    i++
  }

  const upCount = baseParts.length - i
  const upParts = upCount > 0 ? Array(upCount).fill('..') : ['.']
  const downParts = targetParts.slice(i)

  return [...upParts, ...downParts].join('/')
}

async function browseFiles() {
  const path = await OpenImageFileDialog()
  if (path) applyFile(path)
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = false

  // Try URL text drop first (e.g. dragging image from browser)
  const textUrl = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain')
  if (textUrl && /^https?:\/\//i.test(textUrl.trim())) {
    urlValue.value = textUrl.trim()
    return
  }

  // Try file drop - Wails webview may provide path via non-standard property
  const file = e.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) {
    const fullPath = (file as any).path
    if (fullPath) {
      applyFile(fullPath)
    }
    // Without full path, we can't create a correct relative URL
    // User should use the browse button instead
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragOver.value = true
}

function handleDragLeave() {
  isDragOver.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    handleClose()
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
    <div v-if="visible" class="image-dialog-overlay" @mousedown="handleOverlayClick">
      <div class="image-dialog">
        <div class="image-dialog-header">
          <span class="image-dialog-title">{{ editingFrom != null ? t('imageDialog.editTitle') : t('imageDialog.insertTitle') }}</span>
          <button class="image-dialog-close" @click="handleClose">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
          </button>
        </div>

        <div class="image-dialog-content">
          <label class="image-dialog-label">{{ t('imageDialog.imageUrl') }}</label>
          <div class="image-dialog-input-wrap">
            <svg class="input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <input
              ref="urlInputRef"
              v-model="urlValue"
              type="text"
              class="image-dialog-input"
              :placeholder="t('imageDialog.urlPlaceholder')"
            />
          </div>

          <div class="image-dialog-or">
            <span class="or-line" />
            <span class="or-text">{{ t('imageDialog.or') }}</span>
            <span class="or-line" />
          </div>

          <label class="image-dialog-label">{{ t('imageDialog.uploadImage') }}</label>
          <div
            class="image-dialog-dropzone"
            :class="{ 'is-dragover': isDragOver }"
            @drop="handleDrop"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @click="browseFiles"
          >
            <svg class="dropzone-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            <div class="dropzone-text">
              <span class="dropzone-text-muted">{{ t('imageDialog.dropHint') }}</span>
              <span class="dropzone-text-link">{{ t('imageDialog.browse') }}</span>
            </div>
            <span class="dropzone-hint">{{ t('imageDialog.formatHint') }}</span>
          </div>
          <label class="image-dialog-label">{{ t('imageDialog.altText') }}</label>
          <div class="image-dialog-input-wrap">
            <svg class="input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            <input
              v-model="altValue"
              type="text"
              class="image-dialog-input"
              :placeholder="t('imageDialog.altPlaceholder')"
            />
          </div>
        </div>

        <div class="image-dialog-footer">
          <button class="image-dialog-btn image-dialog-btn-cancel" @click="handleClose">{{ t('imageDialog.cancel') }}</button>
          <button
            class="image-dialog-btn image-dialog-btn-insert"
            :disabled="!canInsert"
            @click="handleInsert"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
            {{ editingFrom != null ? t('imageDialog.update') : t('imageDialog.insert') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26, 26, 26, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.image-dialog {
  width: 480px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.image-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.image-dialog-title {
  font-family: var(--font-sans);
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--foreground-primary);
}

.image-dialog-close {
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

.image-dialog-close:hover {
  background: var(--surface-hover);
  color: var(--foreground-secondary);
}

.image-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

.image-dialog-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--foreground-secondary);
}

.image-dialog-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.input-icon {
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.image-dialog-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--foreground-primary);
}

.image-dialog-input::placeholder {
  color: var(--foreground-tertiary);
}

.image-dialog-or {
  display: flex;
  align-items: center;
  gap: 12px;
}

.or-line {
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}

.or-text {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.image-dialog-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 160px;
  border-radius: 8px;
  border: 1px dashed var(--border-strong);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  margin-top: 4px;
}

.image-dialog-dropzone:hover,
.image-dialog-dropzone.is-dragover {
  background: var(--surface-hover);
  border-color: var(--accent-primary);
}

.dropzone-icon {
  color: var(--foreground-tertiary);
}

.image-dialog-dropzone.is-dragover .dropzone-icon {
  color: var(--accent-primary);
}

.dropzone-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.dropzone-text-muted {
  color: var(--foreground-tertiary);
}

.dropzone-text-link {
  color: var(--accent-primary);
  font-weight: 500;
}

.dropzone-hint {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.image-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-subtle);
}

.image-dialog-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
}

.image-dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-dialog-btn-cancel {
  background: var(--surface-primary);
  color: var(--foreground-secondary);
  border: 1px solid var(--border-strong);
}

.image-dialog-btn-cancel:hover {
  background: var(--surface-hover);
}

.image-dialog-btn-insert {
  background: var(--accent-primary);
  color: var(--foreground-inverse);
}

.image-dialog-btn-insert:hover:not(:disabled) {
  background: var(--accent-hover);
}
</style>
