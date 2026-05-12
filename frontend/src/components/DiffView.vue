<script setup lang="ts">
import { computed, watch, nextTick } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { useDiffView } from '../composables/useDiffView'
import { useAIEdit } from '../composables/useAIEdit'
import { useFileTree } from '../composables/useFileTree'
import type { DiffHunk, DiffLine } from '../utils/diff'

const {
  hunks,
  filePath,
  hasChanges,
  pendingCount,
  acceptHunk,
  rejectHunk,
  resetHunk,
  getAppliedContent,
  closeDiffView,
  isHunkAccepted,
  isHunkRejected,
  isHunkPending,
} = useDiffView()

const { applyEdit } = useAIEdit()
const { selectedFileContent } = useFileTree()

// Auto-close diff view when all hunks are handled
watch(pendingCount, (newVal) => {
  if (newVal === 0 && hasChanges.value) {
    const content = getAppliedContent()
    closeDiffView()
    nextTick(() => {
      applyEdit(content, false)
    })
  }
})

const fileName = computed(() => {
  if (!filePath.value) return 'Diff View'
  return filePath.value.split('/').pop() || 'Diff View'
})

function getHunkStatusClass(index: number): string {
  if (isHunkAccepted(index)) return 'accepted'
  if (isHunkRejected(index)) return 'rejected'
  return 'pending'
}

function getLineClass(line: DiffLine): string {
  return line.type
}

function formatLineNumber(num: number | null): string {
  if (num === null) return ''
  return num.toString().padStart(4, ' ')
}
</script>

<template>
  <div class="diff-view">
    <!-- Content -->
    <div class="diff-content">
      <div v-if="!hasChanges" class="diff-empty">
        No changes to review
      </div>

      <div
        v-for="(hunk, hunkIdx) in hunks"
        :key="hunkIdx"
        class="diff-hunk"
        :class="getHunkStatusClass(hunkIdx)"
      >
        <!-- Hunk Header -->
        <div class="hunk-header">
          <span class="hunk-range">
            @@ -{{ hunk.oldStart }},{{ hunk.oldCount }} +{{ hunk.newStart }},{{ hunk.newCount }} @@
          </span>
        </div>

        <!-- Hunk Body -->
        <div class="hunk-body">
          <div class="hunk-lines">
            <div
              v-for="(line, lineIdx) in hunk.lines"
              :key="lineIdx"
              class="diff-line"
              :class="getLineClass(line)"
            >
              <span class="line-gutter">
                <span class="line-old-num">{{ formatLineNumber(line.oldNumber) }}</span>
                <span class="line-new-num">{{ formatLineNumber(line.newNumber) }}</span>
              </span>
              <span class="line-marker">{{ line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' ' }}</span>
              <span class="line-content">{{ line.content }}</span>
            </div>
          </div>

          <!-- Hunk Controls -->
          <div class="hunk-controls">
            <div class="connector" />
            <div class="hunk-buttons">
              <button
                v-if="isHunkPending(hunkIdx)"
                class="hunk-btn y"
                title="Accept this change"
                @click="acceptHunk(hunkIdx)"
              >
                Y
              </button>
              <button
                v-if="isHunkPending(hunkIdx)"
                class="hunk-btn n"
                title="Reject this change"
                @click="rejectHunk(hunkIdx)"
              >
                N
              </button>
              <button
                v-if="isHunkAccepted(hunkIdx)"
                class="hunk-btn status accepted"
                title="Click to reset"
                @click="resetHunk(hunkIdx)"
              >
                <Check :size="10" />
              </button>
              <button
                v-if="isHunkRejected(hunkIdx)"
                class="hunk-btn status rejected"
                title="Click to reset"
                @click="resetHunk(hunkIdx)"
              >
                <X :size="10" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-primary);
}

/* Content */
.diff-content {
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono, 'IBM Plex Mono', monospace);
}

.diff-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--foreground-tertiary);
  font-size: 14px;
  font-family: var(--font-sans);
}

/* Hunk */
.diff-hunk {
  border-bottom: 1px solid var(--border-subtle);
}

.diff-hunk.accepted .hunk-lines {
  opacity: 0.6;
}

.diff-hunk.rejected .hunk-lines {
  opacity: 0.4;
}

.hunk-header {
  padding: 4px 16px;
  background: var(--surface-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.hunk-range {
  font-size: 12px;
  color: var(--foreground-tertiary);
  font-family: var(--font-mono, monospace);
}

.hunk-body {
  display: flex;
  align-items: stretch;
}

.hunk-lines {
  flex: 1;
  min-width: 0;
}

/* Diff Line */
.diff-line {
  display: flex;
  align-items: center;
  min-height: 28px;
  font-size: 13px;
  line-height: 1.4;
}

.diff-line.context {
  background: transparent;
}

.diff-line.removed {
  background: #FFF0F0;
}

.diff-line.added {
  background: #F0FFF4;
}

.line-gutter {
  display: flex;
  flex-shrink: 0;
  width: 80px;
  padding: 0 8px;
  border-right: 1px solid var(--border-subtle);
}

.line-old-num,
.line-new-num {
  display: inline-block;
  width: 40px;
  text-align: right;
  font-size: 12px;
  color: var(--foreground-tertiary);
  font-family: var(--font-mono, monospace);
}

.diff-line.removed .line-old-num {
  color: #FF4444;
}

.diff-line.removed .line-new-num {
  color: transparent;
}

.diff-line.added .line-old-num {
  color: transparent;
}

.diff-line.added .line-new-num {
  color: #22C55E;
}

.line-marker {
  display: inline-block;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 500;
}

.diff-line.removed .line-marker {
  color: #FF4444;
}

.diff-line.added .line-marker {
  color: #22C55E;
}

.line-content {
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
  min-width: 0;
}

.diff-line.removed .line-content {
  color: #CC0000;
}

.diff-line.added .line-content {
  color: #15803D;
}

/* Hunk Controls */
.hunk-controls {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 4px 8px;
  gap: 8px;
  position: relative;
}

.connector {
  width: 1px;
  align-self: stretch;
  background: var(--border-subtle);
  margin: 4px 0;
}

.hunk-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
}

.hunk-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 18px;
  border-radius: 3px;
  border: none;
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--font-sans);
  padding: 0;
}

.hunk-btn.y {
  background: #34D399;
  color: #fff;
}

.hunk-btn.y:hover {
  background: #10B981;
}

.hunk-btn.n {
  background: #FB7185;
  color: #fff;
}

.hunk-btn.n:hover {
  background: #F43F5E;
}

.hunk-btn.status {
  width: 22px;
  cursor: pointer;
}

.hunk-btn.status.accepted {
  background: #34D399;
  color: #fff;
}

.hunk-btn.status.rejected {
  background: #FB7185;
  color: #fff;
}
</style>
