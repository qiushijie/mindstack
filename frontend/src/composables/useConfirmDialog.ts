import { ref } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
}

const visible = ref(false)
const options = ref<ConfirmDialogOptions>({
  title: '',
  message: '',
  confirmText: '',
  cancelText: '',
})
let resolvePromise: ((value: boolean) => void) | null = null

export function useConfirmDialog() {
  function confirm(opts: ConfirmDialogOptions): Promise<boolean> {
    options.value = opts
    visible.value = true
    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function handleConfirm() {
    visible.value = false
    resolvePromise?.(true)
    resolvePromise = null
  }

  function handleCancel() {
    visible.value = false
    resolvePromise?.(false)
    resolvePromise = null
  }

  return { visible, options, confirm, handleConfirm, handleCancel }
}
