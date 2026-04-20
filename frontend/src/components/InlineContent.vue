<script lang="ts" setup>
import type { InlineContent } from '../types/editor'

defineProps<{
  content: InlineContent[]
}>()
</script>

<template>
  <template v-for="(item, index) in content" :key="index">
    <span v-if="item.type === 'text'">{{ item.text }}</span>
    <strong v-else-if="item.type === 'strong'">{{ item.text }}</strong>
    <em v-else-if="item.type === 'em'">{{ item.text }}</em>
    <del v-else-if="item.type === 'del'">{{ item.text }}</del>
    <code v-else-if="item.type === 'code_inline'" class="inline-code">{{ item.text }}</code>
    <a v-else-if="item.type === 'link'" :href="item.href" class="editor-link">{{ item.text }}</a>
  </template>
</template>

<style scoped>
.editor-link {
  color: var(--accent-primary);
  text-decoration: underline;
  text-decoration-color: var(--accent-primary-muted, rgba(0, 102, 255, 0.3));
  text-underline-offset: 2px;
}

.editor-link:hover {
  text-decoration-color: var(--accent-primary);
}
</style>
