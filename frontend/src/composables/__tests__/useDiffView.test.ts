import { describe, it, expect, beforeEach, vi } from 'vitest'

// Ensure window exists before modules that access it at load time
if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', { value: globalThis })
}

import { useDiffView } from '../useDiffView'
import { useTabs, openPageTab } from '../useTabs'
import { useNavigation } from '../useNavigation'
import { computeDiff } from '../../utils/diff'

describe('useDiffView', () => {
  beforeEach(() => {
    // Reset module-level state between tests
    const { clearTabs } = useTabs()
    clearTabs()
    const { navigateTo } = useNavigation()
    navigateTo('editor')
    const { clearDiffState } = useDiffView()
    clearDiffState()
  })

  describe('openDiffView', () => {
    it('sets state correctly and opens diff tab', () => {
      const { isVisible, filePath, originalContent, modifiedContent, hunks, hasChanges } = useDiffView()
      const { tabs } = useTabs()
      const { currentPage } = useNavigation()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'

      const { openDiffView } = useDiffView()
      openDiffView(original, modified, '/root/doc.md')

      expect(isVisible.value).toBe(true)
      expect(filePath.value).toBe('/root/doc.md')
      expect(originalContent.value).toBe(original)
      expect(modifiedContent.value).toBe(modified)
      expect(hunks.value.length).toBeGreaterThan(0)
      expect(hasChanges.value).toBe(true)
      expect(tabs.value).toHaveLength(1)
      expect(tabs.value[0].path).toBe('diff')
      expect(currentPage.value).toBe('diff')
    })

    it('computes diff hunks from original and modified content', () => {
      const { hunks } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'

      const { openDiffView } = useDiffView()
      openDiffView(original, modified, '/root/doc.md')

      expect(hunks.value.length).toBe(1)
      expect(hunks.value[0].lines.some(l => l.type === 'removed')).toBe(true)
      expect(hunks.value[0].lines.some(l => l.type === 'added')).toBe(true)
    })
  })

  describe('acceptHunk', () => {
    it('marks a hunk as accepted', () => {
      const { openDiffView, acceptHunk, isHunkAccepted, isHunkPending } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      acceptHunk(0)

      expect(isHunkAccepted(0)).toBe(true)
      expect(isHunkPending(0)).toBe(false)
    })

    it('removes hunk from rejected when accepting', () => {
      const { openDiffView, rejectHunk, acceptHunk, isHunkAccepted, isHunkRejected } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      rejectHunk(0)
      expect(isHunkRejected(0)).toBe(true)

      acceptHunk(0)
      expect(isHunkAccepted(0)).toBe(true)
      expect(isHunkRejected(0)).toBe(false)
    })
  })

  describe('rejectHunk', () => {
    it('marks a hunk as rejected', () => {
      const { openDiffView, rejectHunk, isHunkRejected, isHunkPending } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      rejectHunk(0)

      expect(isHunkRejected(0)).toBe(true)
      expect(isHunkPending(0)).toBe(false)
    })

    it('removes hunk from accepted when rejecting', () => {
      const { openDiffView, acceptHunk, rejectHunk, isHunkAccepted, isHunkRejected } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      acceptHunk(0)
      expect(isHunkAccepted(0)).toBe(true)

      rejectHunk(0)
      expect(isHunkRejected(0)).toBe(true)
      expect(isHunkAccepted(0)).toBe(false)
    })
  })

  describe('resetHunk', () => {
    it('clears hunk from both accepted and rejected', () => {
      const { openDiffView, acceptHunk, resetHunk, isHunkAccepted, isHunkPending } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      acceptHunk(0)
      expect(isHunkAccepted(0)).toBe(true)

      resetHunk(0)
      expect(isHunkAccepted(0)).toBe(false)
      expect(isHunkPending(0)).toBe(true)
    })

    it('clears rejected hunk back to pending', () => {
      const { openDiffView, rejectHunk, resetHunk, isHunkRejected, isHunkPending } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      rejectHunk(0)
      expect(isHunkRejected(0)).toBe(true)

      resetHunk(0)
      expect(isHunkRejected(0)).toBe(false)
      expect(isHunkPending(0)).toBe(true)
    })
  })

  describe('acceptAll', () => {
    it('accepts all hunks', () => {
      const { openDiffView, acceptAll, isHunkAccepted, pendingCount } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      const { hunks } = useDiffView()
      const hunkCount = hunks.value.length
      expect(hunkCount).toBeGreaterThan(0)

      acceptAll()

      for (let i = 0; i < hunkCount; i++) {
        expect(isHunkAccepted(i)).toBe(true)
      }
      expect(pendingCount.value).toBe(0)
    })

    it('clears all rejected hunks when accepting all', () => {
      const { openDiffView, rejectHunk, acceptAll, isHunkRejected } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      rejectHunk(0)
      acceptAll()

      const { hunks } = useDiffView()
      for (let i = 0; i < hunks.value.length; i++) {
        expect(isHunkRejected(i)).toBe(false)
      }
    })
  })

  describe('rejectAll', () => {
    it('rejects all hunks', () => {
      const { openDiffView, rejectAll, isHunkRejected, pendingCount } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      const { hunks } = useDiffView()
      const hunkCount = hunks.value.length
      expect(hunkCount).toBeGreaterThan(0)

      rejectAll()

      for (let i = 0; i < hunkCount; i++) {
        expect(isHunkRejected(i)).toBe(true)
      }
      expect(pendingCount.value).toBe(0)
    })

    it('clears all accepted hunks when rejecting all', () => {
      const { openDiffView, acceptHunk, rejectAll, isHunkAccepted } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      acceptHunk(0)
      rejectAll()

      const { hunks } = useDiffView()
      for (let i = 0; i < hunks.value.length; i++) {
        expect(isHunkAccepted(i)).toBe(false)
      }
    })
  })

  describe('getAppliedContent', () => {
    it('returns original content when no hunks accepted', () => {
      const { openDiffView, getAppliedContent } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5'
      const modified = 'line1\nchanged2\nline3\nline4\nchanged5'
      openDiffView(original, modified, '/root/doc.md')

      expect(getAppliedContent()).toBe(original)
    })

    it('returns modified content when all hunks accepted', () => {
      const { openDiffView, acceptAll, getAppliedContent } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5'
      const modified = 'line1\nchanged2\nline3\nline4\nchanged5'
      openDiffView(original, modified, '/root/doc.md')

      acceptAll()
      expect(getAppliedContent()).toBe(modified)
    })

    it('returns partial content when some hunks accepted', () => {
      const { openDiffView, acceptHunk, getAppliedContent, hunks } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      const hunkCount = hunks.value.length
      expect(hunkCount).toBeGreaterThanOrEqual(2)

      // Accept first hunk only
      acceptHunk(0)

      const result = getAppliedContent()
      expect(result).not.toBe(original)
      expect(result).not.toBe(modified)
    })

    it('returns original when first hunk is rejected and second is pending', () => {
      const { openDiffView, rejectHunk, getAppliedContent, hunks } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      const hunkCount = hunks.value.length
      expect(hunkCount).toBeGreaterThanOrEqual(2)

      // Reject first hunk
      rejectHunk(0)

      const result = getAppliedContent()
      // Rejected hunks keep original, pending hunks also keep original
      expect(result).toBe(original)
    })

    it('works with computeDiff generated hunks', () => {
      const { openDiffView, acceptHunk, getAppliedContent } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      const hunks = computeDiff(original, modified)

      openDiffView(original, modified, '/root/doc.md')

      // Accept first hunk
      acceptHunk(0)

      const result = getAppliedContent()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('closeDiffView', () => {
    it('clears state and closes diff tab', () => {
      const { openDiffView, closeDiffView, isVisible, hunks, hasChanges } = useDiffView()
      const { tabs } = useTabs()
      const { currentPage } = useNavigation()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')
      expect(tabs.value).toHaveLength(1)

      closeDiffView()

      expect(isVisible.value).toBe(false)
      expect(hunks.value).toHaveLength(0)
      expect(hasChanges.value).toBe(false)
      expect(tabs.value).toHaveLength(0)
    })

    it('navigates to editor when no other tabs exist', () => {
      const { openDiffView, closeDiffView } = useDiffView()
      const { currentPage } = useNavigation()

      openDiffView('a', 'b', '/root/doc.md')
      closeDiffView()

      expect(currentPage.value).toBe('editor')
    })

    it('navigates to editor when remaining tab is a file tab', () => {
      const { openDiffView, closeDiffView } = useDiffView()
      const { openTab } = useTabs()
      const { currentPage } = useNavigation()

      openTab('/root/other.md')
      openDiffView('a', 'b', '/root/doc.md')
      expect(currentPage.value).toBe('diff')

      closeDiffView()

      // File paths are not page tabs, so navigate to editor
      expect(currentPage.value).toBe('editor')
    })

    it('navigates to remaining page tab when closing diff', () => {
      const { openDiffView, closeDiffView } = useDiffView()
      const { currentPage } = useNavigation()

      openPageTab('settings', 'Settings')
      openDiffView('a', 'b', '/root/doc.md')
      expect(currentPage.value).toBe('diff')

      closeDiffView()

      expect(currentPage.value).toBe('settings')
    })
  })

  describe('pendingCount computed', () => {
    it('counts only pending hunks', () => {
      const { openDiffView, pendingCount, hunks, acceptHunk, rejectHunk } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      const totalHunks = hunks.value.length
      expect(totalHunks).toBeGreaterThanOrEqual(2)

      expect(pendingCount.value).toBe(totalHunks)

      acceptHunk(0)
      expect(pendingCount.value).toBe(totalHunks - 1)

      rejectHunk(1)
      expect(pendingCount.value).toBe(totalHunks - 2)
    })

    it('is zero when all hunks are resolved', () => {
      const { openDiffView, pendingCount, acceptAll } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      acceptAll()
      expect(pendingCount.value).toBe(0)
    })
  })

  describe('hasChanges computed', () => {
    it('is true when hunks exist', () => {
      const { openDiffView, hasChanges } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      expect(hasChanges.value).toBe(true)
    })

    it('is false when no hunks exist', () => {
      const { openDiffView, hasChanges } = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nline2\nline3'
      openDiffView(original, modified, '/root/doc.md')

      expect(hasChanges.value).toBe(false)
    })

    it('is false in initial state', () => {
      const { hasChanges } = useDiffView()
      expect(hasChanges.value).toBe(false)
    })
  })

  describe('shared state', () => {
    it('all useDiffView calls share the same state', () => {
      const instance1 = useDiffView()
      const instance2 = useDiffView()

      const original = 'line1\nline2\nline3'
      const modified = 'line1\nchanged2\nline3'
      instance1.openDiffView(original, modified, '/root/doc.md')

      expect(instance2.isVisible.value).toBe(true)
      expect(instance2.filePath.value).toBe('/root/doc.md')
      expect(instance2.hunks.value.length).toBeGreaterThan(0)
    })
  })

  describe('acceptedCount and rejectedCount', () => {
    it('tracks counts correctly', () => {
      const { openDiffView, acceptHunk, rejectHunk, acceptedCount, rejectedCount } = useDiffView()

      const original = 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12'
      const modified = 'CHANGED1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nCHANGED12'
      openDiffView(original, modified, '/root/doc.md')

      expect(acceptedCount.value).toBe(0)
      expect(rejectedCount.value).toBe(0)

      acceptHunk(0)
      expect(acceptedCount.value).toBe(1)
      expect(rejectedCount.value).toBe(0)

      rejectHunk(1)
      expect(acceptedCount.value).toBe(1)
      expect(rejectedCount.value).toBe(1)
    })
  })

  describe('renderKey', () => {
    it('increments when opening diff view', () => {
      const { renderKey, openDiffView } = useDiffView()

      const initialKey = renderKey.value
      openDiffView('a', 'b', '/root/doc.md')

      expect(renderKey.value).toBe(initialKey + 1)
    })
  })
})
