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

      const progress1: SyncProgress = { file: 'a.md', current: 1, total: 3, status: 'processing' }
      const progress2: SyncProgress = { file: 'b.md', current: 2, total: 3, status: 'processing' }

      progressListener!(JSON.stringify(progress1))
      progressListener!(JSON.stringify(progress2))

      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenCalledWith(progress1)
      expect(onProgress).toHaveBeenCalledWith(progress2)
      expect(syncLoading.value).toBe(true)
    })

    it('calls onDone and cleans up when status is complete', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      const progress: SyncProgress = { file: '', current: 3, total: 3, status: 'complete' }
      progressListener!(JSON.stringify(progress))

      expect(onProgress).toHaveBeenCalledWith(progress)
      expect(onDone).toHaveBeenCalled()
      expect(syncLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('sync:progress')
    })

    it('calls onError and cleans up when fatal error is received', () => {
      vi.mocked(SyncWorkspace).mockResolvedValue('')

      const { syncWorkspace, syncLoading, syncError } = useSync()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      syncWorkspace(onProgress, onDone, onError)

      // Fatal error: status=error, current=0, total=0
      const errorProgress: SyncProgress = {
        file: '', current: 0, total: 0, status: 'error', error: 'Git not initialized',
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

      // File-level error: status=error but current/total are non-zero
      const fileError: SyncProgress = {
        file: 'broken.md', current: 2, total: 5, status: 'error', error: 'Parse error',
      }
      progressListener!(JSON.stringify(fileError))

      // File errors are forwarded as progress, not treated as fatal
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
        file: '', current: 0, total: 0, status: 'error',
      }
      progressListener!(JSON.stringify(errorProgress))

      expect(onError).toHaveBeenCalledWith('Sync failed')
      expect(syncError.value).toBe('Sync failed')
    })
  })
})
