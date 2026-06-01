import { ref, computed } from 'vue'
import { computeDiff, applyHunks, type DiffHunk } from '../utils/diff'
import { openPageTab, closeTabByPath, isPageTab } from './useTabs'
import { useNavigation, type PageName } from './useNavigation'

export interface DiffViewState {
  visible: boolean
  originalContent: string
  modifiedContent: string
  filePath: string
  hunks: DiffHunk[]
  acceptedHunks: Set<number>
  rejectedHunks: Set<number>
}

const state = ref<DiffViewState>({
  visible: false,
  originalContent: '',
  modifiedContent: '',
  filePath: '',
  hunks: [],
  acceptedHunks: new Set(),
  rejectedHunks: new Set(),
})

const renderKey = ref(0)

export function useDiffView() {
  const { navigateTo } = useNavigation()
  const isVisible = computed(() => state.value.visible)
  const hunks = computed(() => state.value.hunks)
  const filePath = computed(() => state.value.filePath)
  const originalContent = computed(() => state.value.originalContent)
  const modifiedContent = computed(() => state.value.modifiedContent)
  const hasChanges = computed(() => state.value.hunks.length > 0)

  const acceptedCount = computed(() => state.value.acceptedHunks.size)
  const rejectedCount = computed(() => state.value.rejectedHunks.size)
  const pendingCount = computed(() =>
    state.value.hunks.length - state.value.acceptedHunks.size - state.value.rejectedHunks.size,
  )

  function openDiffView(original: string, modified: string, path: string) {
    const diffHunks = computeDiff(original, modified)
    state.value = {
      visible: true,
      originalContent: original,
      modifiedContent: modified,
      filePath: path,
      hunks: diffHunks,
      acceptedHunks: new Set(),
      rejectedHunks: new Set(),
    }
    renderKey.value++
    openPageTab('diff', 'Diff')
    navigateTo('diff')
  }

  // Expose for e2e tests
  if (import.meta.env.DEV) {
    (window as any).__testOpenDiffView = openDiffView
    ;(window as any).__testAcceptAll = acceptAll
    ;(window as any).__testCloseDiffView = closeDiffView
  }

  function clearDiffState() {
    state.value = {
      visible: false,
      originalContent: '',
      modifiedContent: '',
      filePath: '',
      hunks: [],
      acceptedHunks: new Set(),
      rejectedHunks: new Set(),
    }
  }

  function closeDiffView() {
    clearDiffState()
    const newPath = closeTabByPath('diff')
    if (newPath && isPageTab(newPath)) {
      navigateTo(newPath as PageName)
    } else {
      navigateTo('editor')
    }
  }

  function acceptHunk(index: number) {
    state.value.acceptedHunks.add(index)
    state.value.rejectedHunks.delete(index)
  }

  function rejectHunk(index: number) {
    state.value.rejectedHunks.add(index)
    state.value.acceptedHunks.delete(index)
  }

  function acceptAll() {
    state.value.acceptedHunks = new Set(state.value.hunks.map((_, i) => i))
    state.value.rejectedHunks.clear()
  }

  function rejectAll() {
    state.value.rejectedHunks = new Set(state.value.hunks.map((_, i) => i))
    state.value.acceptedHunks.clear()
  }

  function resetHunk(index: number) {
    state.value.acceptedHunks.delete(index)
    state.value.rejectedHunks.delete(index)
  }

  function isHunkAccepted(index: number): boolean {
    return state.value.acceptedHunks.has(index)
  }

  function isHunkRejected(index: number): boolean {
    return state.value.rejectedHunks.has(index)
  }

  function isHunkPending(index: number): boolean {
    return !state.value.acceptedHunks.has(index) && !state.value.rejectedHunks.has(index)
  }

  function getAppliedContent(): string {
    return applyHunks(state.value.originalContent, state.value.hunks, state.value.acceptedHunks)
  }

  return {
    state,
    renderKey,
    isVisible,
    hunks,
    filePath,
    originalContent,
    modifiedContent,
    hasChanges,
    acceptedCount,
    rejectedCount,
    pendingCount,
    openDiffView,
    closeDiffView,
    clearDiffState,
    acceptHunk,
    rejectHunk,
    acceptAll,
    rejectAll,
    resetHunk,
    isHunkAccepted,
    isHunkRejected,
    isHunkPending,
    getAppliedContent,
  }
}
