import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BuildProgress } from '../useBuild'

// Capture the listener registered via EventsOn so tests can emit events
let progressListener: ((data: string) => void) | null = null

vi.mock('../../../wailsjs/go/main/App', () => ({
  BuildWorkspace: vi.fn(),
}))

vi.mock('../../../wailsjs/runtime/runtime', () => ({
  EventsOn: vi.fn((_eventName: string, callback: (data: string) => void) => {
    progressListener = callback
  }),
  EventsOff: vi.fn(),
}))

import { BuildWorkspace } from '../../../wailsjs/go/main/App'
import { EventsOff } from '../../../wailsjs/runtime/runtime'
import { useBuild } from '../useBuild'

beforeEach(() => {
  progressListener = null
  vi.mocked(BuildWorkspace).mockReset()
  vi.mocked(EventsOff).mockReset()
})

describe('useBuild', () => {
  describe('buildWorkspace', () => {
    it('calls onProgress for each progress event', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildLoading } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      expect(buildLoading.value).toBe(true)
      expect(progressListener).not.toBeNull()

      const progress1: BuildProgress = { file: 'a.md', current: 1, total: 3, status: 'processing', phase: 'meta' }
      const progress2: BuildProgress = { file: 'b.md', current: 2, total: 3, status: 'processing', phase: 'meta' }

      progressListener!(JSON.stringify(progress1))
      progressListener!(JSON.stringify(progress2))

      expect(onProgress).toHaveBeenCalledTimes(2)
      expect(onProgress).toHaveBeenCalledWith(progress1)
      expect(onProgress).toHaveBeenCalledWith(progress2)
      expect(buildLoading.value).toBe(true)
    })

    it('calls onDone and cleans up when relation phase completes', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildLoading } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      const metaComplete: BuildProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'meta' }
      progressListener!(JSON.stringify(metaComplete))

      expect(onProgress).toHaveBeenCalledWith(metaComplete)
      expect(onDone).not.toHaveBeenCalled()
      expect(buildLoading.value).toBe(true)

      const relationComplete: BuildProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'relation' }
      progressListener!(JSON.stringify(relationComplete))

      expect(onProgress).toHaveBeenCalledWith(relationComplete)
      expect(onDone).toHaveBeenCalled()
      expect(buildLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('build:progress')
    })

    it('does not call onDone on meta phase complete', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildLoading } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      const metaComplete: BuildProgress = { file: '', current: 3, total: 3, status: 'complete', phase: 'meta' }
      progressListener!(JSON.stringify(metaComplete))

      expect(onProgress).toHaveBeenCalledWith(metaComplete)
      expect(onDone).not.toHaveBeenCalled()
      expect(buildLoading.value).toBe(true)
    })

    it('calls onError and cleans up when fatal error is received', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildLoading, buildError } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      const errorProgress: BuildProgress = {
        file: '', current: 0, total: 0, status: 'error', error: 'Git not initialized', phase: 'meta',
      }
      progressListener!(JSON.stringify(errorProgress))

      expect(onError).toHaveBeenCalledWith('Git not initialized')
      expect(buildError.value).toBe('Git not initialized')
      expect(buildLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('build:progress')
      expect(onProgress).not.toHaveBeenCalled()
    })

    it('reports file-level errors as progress, not fatal', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      const fileError: BuildProgress = {
        file: 'broken.md', current: 2, total: 5, status: 'error', error: 'Parse error', phase: 'meta',
      }
      progressListener!(JSON.stringify(fileError))

      expect(onProgress).toHaveBeenCalledWith(fileError)
      expect(onError).not.toHaveBeenCalled()
    })

    it('calls onError when BuildWorkspace promise rejects', async () => {
      vi.mocked(BuildWorkspace).mockRejectedValue(new Error('Disk full'))

      const { buildWorkspace, buildLoading, buildError } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(onError).toHaveBeenCalledWith('Disk full')
      expect(buildError.value).toBe('Disk full')
      expect(buildLoading.value).toBe(false)
    })

    it('handles BuildWorkspace rejection with non-Error object', async () => {
      vi.mocked(BuildWorkspace).mockRejectedValue('raw failure')

      const { buildWorkspace, buildError } = useBuild()
      const onError = vi.fn()

      buildWorkspace(vi.fn(), vi.fn(), onError)

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalled()
      })

      expect(buildError.value).toBe('Build failed')
    })

    it('calls onError and cleans up on malformed JSON', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildLoading, buildError } = useBuild()
      const onProgress = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      buildWorkspace(onProgress, onDone, onError)

      progressListener!('invalid-json')

      expect(onError).toHaveBeenCalledWith('Failed to parse build progress data')
      expect(buildError.value).toBe('Failed to parse build progress data')
      expect(buildLoading.value).toBe(false)
      expect(EventsOff).toHaveBeenCalledWith('build:progress')
    })

    it('uses default error message when fatal error has no error field', () => {
      vi.mocked(BuildWorkspace).mockResolvedValue('')

      const { buildWorkspace, buildError } = useBuild()
      const onError = vi.fn()

      buildWorkspace(vi.fn(), vi.fn(), onError)

      const errorProgress: BuildProgress = {
        file: '', current: 0, total: 0, status: 'error', phase: 'meta',
      }
      progressListener!(JSON.stringify(errorProgress))

      expect(onError).toHaveBeenCalledWith('Build failed')
      expect(buildError.value).toBe('Build failed')
    })
  })
})
