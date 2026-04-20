<script lang="ts" setup>
</script>

<template>
  <div class="status-bar">
    <span class="status-item">Markdown</span>
    <span class="status-sep">|</span>
    <span class="status-item">Ln 42, Col 18</span>
    <span class="status-sep">|</span>
    <span class="status-item">286 words</span>
    <span class="status-sep">|</span>
    <span class="status-item">1,432 chars</span>
    <span class="status-spacer" />
    <span class="status-item">UTF-8</span>
  </div>
</template>

<style scoped>
.status-bar {
  height: var(--status-bar-height);
  background-color: var(--surface-secondary);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: 0 var(--spacing-lg);
  user-select: none;
}

.status-item {
  font-size: var(--font-size-xs);
  color: var(--foreground-tertiary);
}

.status-sep {
  font-size: var(--font-size-xs);
  color: var(--border-strong);
}

.status-spacer {
  flex: 1;
}
</style>
