import { ref } from 'vue'
import { BuildWorkspace as BuildWorkspaceBinding } from '../../wailsjs/go/main/App'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

export interface BuildProgress {
  file: string
  current: number
  total: number
  status: 'processing' | 'done' | 'error' | 'complete' | 'skipped' | 'analyzing'
  error?: string
  summary?: string
  phase: 'meta' | 'relation'
}

export function useBuild() {
  const buildLoading = ref(false)
  const buildError = ref('')

  function buildWorkspace(
    onProgress: (progress: BuildProgress) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ) {
    buildLoading.value = true
    buildError.value = ''

    EventsOff('build:progress')
    EventsOn('build:progress', (data: string) => {
      let progress: BuildProgress
      try {
        progress = JSON.parse(data)
      } catch {
        buildError.value = 'Failed to parse build progress data'
        onError(buildError.value)
        cleanup()
        return
      }
      if (progress.status === 'error' && progress.current === 0 && progress.total === 0) {
        buildError.value = progress.error || 'Build failed'
        onError(buildError.value)
        cleanup()
      } else {
        onProgress(progress)
        if (progress.status === 'complete' && progress.phase === 'relation') {
          cleanup()
          onDone()
        }
      }
    })

    BuildWorkspaceBinding().catch((err: any) => {
      buildError.value = err.message || 'Build failed'
      onError(buildError.value)
      cleanup()
    })

    let cleaned = false
    function cleanup() {
      if (cleaned) return
      cleaned = true
      buildLoading.value = false
      EventsOff('build:progress')
    }
  }

  return { buildLoading, buildError, buildWorkspace }
}
