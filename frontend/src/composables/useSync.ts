import { ref } from 'vue'
import { SyncWorkspace as SyncWorkspaceBinding } from '../../wailsjs/go/main/App'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

export interface SyncProgress {
  file: string
  current: number
  total: number
  status: 'processing' | 'done' | 'error' | 'complete'
  error?: string
  summary?: string
}

export function useSync() {
  const syncLoading = ref(false)
  const syncError = ref('')

  function syncWorkspace(
    onProgress: (progress: SyncProgress) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) {
    syncLoading.value = true
    syncError.value = ''

    EventsOff('sync:progress')
    EventsOn('sync:progress', (data: string) => {
      let progress: SyncProgress
      try {
        progress = JSON.parse(data)
      } catch {
        syncError.value = 'Failed to parse sync progress data'
        onError(syncError.value)
        cleanup()
        return
      }
      if (progress.status === 'error' && progress.current === 0 && progress.total === 0) {
        syncError.value = progress.error || 'Sync failed'
        onError(syncError.value)
        cleanup()
      } else {
        onProgress(progress)
        if (progress.status === 'complete') {
          cleanup()
          onDone()
        }
      }
    })

    SyncWorkspaceBinding().catch((err: any) => {
      syncError.value = err.message || 'Sync failed'
      onError(syncError.value)
      cleanup()
    })

    let cleaned = false
    function cleanup() {
      if (cleaned) return
      cleaned = true
      syncLoading.value = false
      EventsOff('sync:progress')
    }
  }

  return { syncLoading, syncError, syncWorkspace }
}
