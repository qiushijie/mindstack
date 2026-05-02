import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SyncProgress } from '../useSync'

// Capture the listener registered via EventsOn so tests can emit events
let progressListener: ((data: string) => void) | null = null

vi.mock('../../../wailsjs/go/main/App', () => ({
  SyncWorkspace: vi.fn(),
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn((_eventName: string, callback: (data: string) => void) => {
    progressListener = callback
  }),
  EventsOff: vi.fn(),
}))

import { SyncWorkspace } from '../../../wailsjs/go/main/App'
import { EventsOff } from '../../../wailsjs/runtime/runtime'
import { useSync } from '../useSync'

beforeEach(() => {
  progressListener = null
  vi.mocked(SyncWorkspace).mockReset()
  vi.mocked(EventsOff).mockReset()
})

describe('useSync', () => {
  describe('syncWorkspace', () => {
    it('calls onProgress for each progress event', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      expect(syncLoading.value).toBe(true)
      expect(progressListener).not.toBeNull()

      const progress1: SyncProgress = { file: 'a.md', current: 1, total: 3, status: 'processing', phase: 'meta' }
      const progress2: SyncProgress = { file: 'b.md', current: 2, total: 3, status: 'processing', phase: 'meta' }

      progressListener!(JSON.stringify(progress1))
      progressListener!(JSON.stringify(progress2))

      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenCalledWith(progress1)
      expect(onProgress).toHaveBeenCalledWith(progress2)
      expect(syncLoading.value).toBe(true)
    })

    it('calls onDone and cleans up when relation phase completes', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      const metaComplete: SyncProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'meta' }
      progressListener!(JSON.stringify(metaComplete))

      expect(onProgress).toHaveBeenCalledWith(metaComplete)
      expect(onDone).not.toHaveBeenCalled()
      expect(syncLoading.value).toBe(true)

      const relationComplete: SyncProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'relation' }
      progressListener!(JSON.stringify(relationComplete))

      expect(onProgress).toHaveBeenCalledWith(relationComplete)
      expect(onDone).toHaveBeenCalled()
      expect(syncLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('sync:progress')
    })

    it('does not call onDone on meta phase complete', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      const metaComplete: SyncProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'meta' }
      progressListener!(JSON.stringify(metaComplete))

      expect(onProgress).toHaveBeenCalledWith(metaComplete)
      expect(onDone).not.toHaveBeenCalled()
      expect(syncLoading.value).toBe(true)
    })

    it('calls onError and cleans up when fatal error is received', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading, syncError } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      const errorProgress: SyncProgress = {
        file: '', current: 0, total: 0, status: 'error', error: 'Git not initialized', phase: 'meta',
      }
      progressListener!(JSON.stringify(errorProgress))

      expect(onError).toHaveBeenCalledWith('Git not initialized')
      expect(syncError.value).toBe('Git not initialized')
      expect(syncLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('sync:progress')
      expect(onProgress).not.toHaveBeenCalled()
    })

    it('reports file-level errors as progress, not fatal', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      const fileError: SyncProgress = {
        file: 'broken.md', current: 2, total: 5, status: 'error', error: 'Parse error', phase: 'meta',
      }
      progressListener!(JSON.stringify(fileError))

      expect(onProgress).toHaveBeenCalledWith(fileError)
      expect(onError).not.toHaveBeenCalled()
    })

    it('calls onError when SyncWorkspace promise rejects', async () => {
      vi.mocked(SyncWorkspace).mockRejectedValue(new Error('Disk full'))

      const { syncWorkspace, syncLoading, syncError } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError).toHaveBeenCalledWith('Disk full')
      expect(syncError.value).toBe('Disk full')
      expect(syncLoading.value).toBe(false)
    })

    it('handles SyncWorkspace rejection with non-Error object', async () => {
      vi.mocked(SyncWorkspace).mockRejectedValue('raw failure')

      const { syncWorkspace, syncError } = useSync()
      const onError = vi.fn()

      syncWorkspace(vi.fn(), vi.fn(), onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(syncError.value).toBe('Sync failed')
    })

    it('calls onError and cleans up on malformed JSON', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading, syncError } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      progressListener!('invalid-json')

      expect(onError).toHaveBeenCalledWith('Failed to parse sync progress data')
      expect(syncError.value).toBe('Failed to parse sync progress data')
      expect(syncLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('sync:progress')
    })

    it('uses default error message when fatal error has no error field', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncError } = useSync()
      const onError = vi.fn()

      syncWorkspace(vi.fn(), vi.fn(), onError)

      const errorProgress: SyncProgress = {
        file: '', current: 0, total: 0, status: 'error', phase: 'meta',
      }
      progressListener!(JSON.stringify(errorProgress))

      expect(onError).toHaveBeenCalledWith('Sync failed')
      expect(syncError.value).toBe('Sync failed')
    })
  })
})
