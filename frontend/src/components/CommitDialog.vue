<script lang="ts" setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { GitStatus, GitCommitFiles, GitGenerateCommitMessage, GitPush } from '../../wailsjs/go/main/App'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  'commit-success': [payload: { message: string }]
}>()

interface GitFile {
  path: string
  staged: string
  unstaged: string
  selected: boolean
}

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  file?: GitFile
}

interface FlatNode {
  name: string
  path: string
  isDir: boolean
  depth: number
  file?: GitFile
  checkState: 'checked' | 'unchecked' | 'indeterminate'
}

const files = ref<GitFile[]>([])
const commitMsg = ref('')
const loading = ref(false)
const statusMsg = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const expandedDirs = ref(new Set<string>())
const pushAfterCommit = ref(false)

const selectedFiles = computed(() =>
  files.value.filter(f => f.selected).map(f => f.path)
)

function buildTree(filesList: GitFile[]): TreeNode[] {
  const roots: TreeNode[] = []
  for (const file of filesList) {
    const isDirEntry = file.path.endsWith('/')
    const cleanPath = isDirEntry ? file.path.slice(0, -1) : file.path
    const parts = cleanPath.split('/')
    let current = roots
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const name = parts[i]
      const subPath = parts.slice(0, i + 1).join('/')
      let node = current.find(n => n.name === name)
      if (!node) {
        node = {
          name,
          path: subPath,
          isDir: !isLast || isDirEntry,
          children: [],
          file: (isLast && !isDirEntry) ? file : undefined,
        }
        current.push(node)
      }
      current = node.children
    }
  }
  return roots
}

function fillExpanded(nodes: TreeNode[], dirs: Set<string>) {
  for (const n of nodes) {
    if (n.isDir && n.children.length > 0) {
      dirs.add(n.path)
      fillExpanded(n.children, dirs)
    }
  }
}

const flatTree = computed(() => {
  const tree = buildTree(files.value)
  function calcDirState(node: TreeNode): FlatNode['checkState'] {
    let checkedCount = 0
    let totalCount = 0
    for (const child of node.children) {
      if (child.isDir) {
        const s = calcDirState(child)
        if (s === 'indeterminate') return 'indeterminate'
        if (s === 'checked') checkedCount++
        totalCount++
      } else if (child.file) {
        if (child.file.selected) checkedCount++
        totalCount++
      }
    }
    if (totalCount === 0) return 'unchecked'
    if (checkedCount === totalCount) return 'checked'
    return 'indeterminate'
  }
  function flatten(nodes: TreeNode[], depth: number): FlatNode[] {
    const result: FlatNode[] = []
    for (const node of nodes) {
      result.push({
        name: node.name,
        path: node.path,
        isDir: node.isDir,
        depth,
        file: node.file,
        checkState: node.isDir ? calcDirState(node) : (node.file?.selected ? 'checked' : 'unchecked'),
      })
      if (node.isDir && expandedDirs.value.has(node.path)) {
        result.push(...flatten(node.children, depth + 1))
      }
    }
    return result
  }
  return flatten(tree, 0)
})

function statusLabel(staged: string, unstaged: string): { text: string; color: string } {
  if (staged === 'M' || unstaged === 'M') return { text: 'M', color: '#E68A2E' }
  if (staged === 'A' || unstaged === 'A') return { text: 'A', color: '#22A55A' }
  if (staged === 'D' || unstaged === 'D') return { text: 'D', color: '#D14444' }
  if (staged === '?' || unstaged === '?') return { text: '?', color: '#999999' }
  if (staged === 'R' || unstaged === 'R') return { text: 'R', color: '#7C3AED' }
  return { text: 'M', color: '#E68A2E' }
}

async function loadFiles() {
  statusMsg.value = ''
  const result = await GitStatus()
  const data = JSON.parse(result)
  if (data.error) {
    statusMsg.value = data.error
    files.value = []
    return
  }
  if (data.clean) {
    files.value = []
    return
  }
  files.value = (data.files || []).map((f: { path: string; staged: string; unstaged: string }) => ({
    path: f.path,
    staged: f.staged?.trim() || '',
    unstaged: f.unstaged?.trim() || '',
    selected: true,
  }))
  const dirs = new Set<string>()
  fillExpanded(buildTree(files.value), dirs)
  expandedDirs.value = dirs
}

function toggleExpand(path: string) {
  const s = new Set(expandedDirs.value)
  if (s.has(path)) s.delete(path)
  else s.add(path)
  expandedDirs.value = s
}

function toggleFileByPath(path: string) {
  const file = files.value.find(f => f.path === path)
  if (file) file.selected = !file.selected
}

function getDirFiles(node: TreeNode): GitFile[] {
  const result: GitFile[] = []
  for (const child of node.children) {
    if (child.isDir) result.push(...getDirFiles(child))
    else if (child.file) result.push(child.file)
  }
  return result
}

function findNode(nodes: TreeNode[], path: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.isDir) {
      const found = findNode(node.children, path)
      if (found) return found
    }
  }
  return undefined
}

function toggleTreeNode(flatNode: FlatNode) {
  if (flatNode.isDir) {
    const dirFiles = files.value.filter(f => f.path.startsWith(flatNode.path))
    const allSelected = dirFiles.every(f => f.selected)
    for (const f of dirFiles) f.selected = !allSelected
  } else {
    toggleFileByPath(flatNode.path)
  }
}

function handleOverlayClick(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains('commit-dialog-overlay')) {
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    emit('close')
  }
}

async function handleCommit() {
  if (!commitMsg.value.trim() || loading.value) return
  loading.value = true
  statusMsg.value = ''
  try {
    const paths = selectedFiles.value
    const result = await GitCommitFiles(commitMsg.value.trim(), paths)
    const data = JSON.parse(result)
    if (data.error) {
      statusMsg.value = t('editor.gitSync.error', { error: data.error })
      return
    }
    if (pushAfterCommit.value) {
      const pushResult = await GitPush()
      const pushData = JSON.parse(pushResult)
      if (pushData.error) {
        statusMsg.value = t('editor.gitSync.pushError', { error: pushData.error })
        emit('commit-success', { message: commitMsg.value.trim() })
        emit('close')
        return
      }
    }
    emit('commit-success', { message: commitMsg.value.trim() })
    emit('close')
  } catch (err) {
    statusMsg.value = t('editor.gitSync.error', { error: String(err) })
  } finally {
    loading.value = false
  }
}

let statusTimeout: ReturnType<typeof setTimeout> | null = null

async function handleGenerateMessage() {
  if (loading.value) return
  loading.value = true
  statusMsg.value = t('editor.gitSync.generatingMessage')
  try {
    const paths = selectedFiles.value
    const result = await GitGenerateCommitMessage(paths)
    const data = JSON.parse(result)
    if (data.error) {
      statusMsg.value = t('editor.gitSync.error', { error: data.error })
    } else if (data.note === 'no changes detected') {
      statusMsg.value = t('editor.gitSync.nothingToCommit')
    } else if (data.ok && data.message) {
      commitMsg.value = data.message
      statusMsg.value = t('editor.gitSync.messageGenerated')
      if (statusTimeout) clearTimeout(statusTimeout)
      statusTimeout = setTimeout(() => {
        statusMsg.value = ''
      }, 3000)
    }
  } catch (err) {
    statusMsg.value = t('editor.gitSync.error', { error: String(err) })
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    commitMsg.value = ''
    statusMsg.value = ''
    loading.value = false
    pushAfterCommit.value = false
    loadFiles()
    nextTick(() => textareaRef.value?.focus())
  } else {
    if (statusTimeout) clearTimeout(statusTimeout)
    statusTimeout = null
  }
})

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="commit-dialog-overlay" @mousedown="handleOverlayClick">
      <div class="commit-dialog">
        <div class="commit-dialog-header">
          <span class="commit-dialog-title">{{ t('editor.gitSync.commit') }} Changes</span>
          <button class="commit-dialog-close" @click="emit('close')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
          </button>
        </div>

        <div class="commit-dialog-content">
          <div v-if="statusMsg" class="commit-dialog-status">{{ statusMsg }}</div>

          <div class="commit-files-section">
            <span class="commit-section-label">{{ t('editor.gitSync.commit') }} Files</span>
            <div v-if="files.length === 0 && !statusMsg" class="commit-files-empty">
              No changed files
            </div>
            <div v-else class="commit-files-list">
              <div
                v-for="node in flatTree"
                :key="node.path"
                class="commit-file-row"
                :class="{ 'tree-dir-row': node.isDir }"
                :style="{ paddingLeft: (node.depth * 20 + 4) + 'px' }"
                @click="toggleTreeNode(node)"
              >
                <span v-if="node.isDir" class="tree-expand-icon" @click.stop="toggleExpand(node.path)">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline :points="expandedDirs.has(node.path) ? '6 9 12 15 18 9' : '9 18 15 12 9 6'" />
                  </svg>
                </span>
                <span v-else class="tree-blank-icon"></span>
                <div
                  class="commit-file-checkbox"
                  :class="{
                    checked: node.checkState === 'checked',
                    indeterminate: node.checkState === 'indeterminate',
                  }"
                  @click.stop="toggleTreeNode(node)"
                >
                  <svg v-if="node.checkState === 'checked'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else-if="node.checkState === 'indeterminate'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span class="commit-file-path">{{ node.name }}</span>
                <span
                  v-if="!node.isDir && node.file"
                  class="commit-file-status"
                  :style="{ color: statusLabel(node.file.staged, node.file.unstaged).color }"
                >{{ statusLabel(node.file.staged, node.file.unstaged).text }}</span>
              </div>
            </div>
          </div>

          <div class="commit-msg-section">
            <span class="commit-section-label">{{ t('editor.gitSync.commitMessage') }}</span>
            <textarea
              ref="textareaRef"
              v-model="commitMsg"
              class="commit-msg-textarea"
              :placeholder="t('editor.gitSync.commitMessage')"
              rows="3"
            />
          </div>
        </div>

        <div class="commit-dialog-footer">
          <label class="push-after-commit" @click.prevent="pushAfterCommit = !pushAfterCommit">
            <div
              class="push-after-checkbox"
              :class="{ checked: pushAfterCommit }"
            >
              <svg v-if="pushAfterCommit" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <span>{{ t('editor.gitSync.pushAfterCommit') }}</span>
          </label>
          <div class="commit-dialog-footer-btns">
            <button class="commit-btn commit-btn-cancel" @click="emit('close')" :disabled="loading">
              Cancel
            </button>
            <button
              class="commit-btn commit-btn-primary"
              :disabled="!commitMsg.trim() || loading"
              @click="handleCommit"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v6"/><path d="M12 15v6"/></svg>
              {{ t('editor.gitSync.commit') }}
            </button>
            <button
              class="commit-btn commit-btn-ai"
              :disabled="files.length === 0 || loading"
              @click="handleGenerateMessage"
            >
              {{ t('editor.gitSync.aiGenerate') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.commit-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.commit-dialog {
  width: 500px;
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.commit-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.commit-dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.commit-dialog-close {
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

.commit-dialog-close:hover {
  background: var(--surface-hover);
  color: var(--foreground-secondary);
}

.commit-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 20px 20px;
}

.commit-dialog-status {
  font-size: 12px;
  color: var(--accent-primary);
  padding: 8px 12px;
  background: var(--surface-secondary);
  border-radius: 6px;
}

.commit-section-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--foreground-secondary);
  display: block;
  margin-bottom: 8px;
}

.commit-files-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

.commit-files-empty {
  font-size: 13px;
  color: var(--foreground-tertiary);
  padding: 12px 0;
}

.commit-file-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
}

.commit-file-row:hover {
  background: var(--surface-hover);
}

.tree-dir-row {
  font-weight: 500;
}

.tree-expand-icon {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.tree-expand-icon:hover {
  color: var(--foreground-primary);
}

.tree-blank-icon {
  width: 16px;
  flex-shrink: 0;
}

.commit-file-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.commit-file-checkbox.indeterminate {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  opacity: 0.6;
}

.commit-file-checkbox.indeterminate svg {
  color: #fff;
}

.commit-file-checkbox.checked {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.commit-file-checkbox svg {
  color: #fff;
}

.commit-file-path {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit-file-status {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  width: 16px;
  text-align: center;
  flex-shrink: 0;
}

.commit-msg-section {
  display: flex;
  flex-direction: column;
}

.commit-msg-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-secondary);
  color: var(--foreground-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
  outline: none;
}

.commit-msg-textarea:focus {
  border-color: var(--accent-primary);
}

.commit-msg-textarea::placeholder {
  color: var(--foreground-tertiary);
}

.commit-dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}

.commit-dialog-footer-btns {
  display: flex;
  gap: 8px;
}

.push-after-commit {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  color: var(--foreground-secondary);
}

.push-after-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.push-after-checkbox.checked {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.push-after-checkbox svg {
  color: #fff;
}

.commit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
}

.commit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.commit-btn-cancel {
  background: var(--surface-primary);
  color: var(--foreground-secondary);
  border: 1px solid var(--border-strong);
}

.commit-btn-cancel:hover:not(:disabled) {
  background: var(--surface-hover);
}

.commit-btn-primary {
  background: var(--accent-primary);
  color: var(--foreground-inverse);
}

.commit-btn-primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

.commit-btn-ai {
  background: #7C3AED;
  color: #fff;
}

.commit-btn-ai:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
