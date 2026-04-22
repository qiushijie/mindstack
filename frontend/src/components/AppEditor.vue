<script lang="ts" setup>
import CodeMirrorEditor from './CodeMirrorEditor.vue'
</script>

<template>
  <div class="editor">
    <CodeMirrorEditor />
  </div>
</template>

<style scoped>
.editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
