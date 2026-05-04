import { describe, it, expect, beforeEach } from 'vitest'
import { useConfirmDialog } from '../useConfirmDialog'

describe('useConfirmDialog', () => {
  beforeEach(() => {
    const { handleCancel } = useConfirmDialog()
    handleCancel()
  })

  it('starts invisible with empty options', () => {
    const { visible, options } = useConfirmDialog()

    expect(visible.value).toBe(false)
    expect(options.value).toEqual({
      title: '',
      message: '',
      confirmText: '',
      cancelText: '',
    })
  })

  it('returns true when confirmed', async () => {
    const { visible, options, confirm, handleConfirm } = useConfirmDialog()

    const promise = confirm({
      title: 'Unsaved Changes',
      message: 'Save before closing?',
      confirmText: 'Save',
      cancelText: 'Discard',
    })

    expect(visible.value).toBe(true)
    expect(options.value).toEqual({
      title: 'Unsaved Changes',
      message: 'Save before closing?',
      confirmText: 'Save',
      cancelText: 'Discard',
    })

    handleConfirm()

    await expect(promise).resolves.toBe(true)
    expect(visible.value).toBe(false)
  })

  it('returns false when cancelled', async () => {
    const { confirm, handleCancel } = useConfirmDialog()

    const promise = confirm({
      title: 'Test',
      message: 'Test?',
      confirmText: 'Yes',
      cancelText: 'No',
    })

    handleCancel()

    await expect(promise).resolves.toBe(false)
  })

  it('hides dialog after confirm', () => {
    const { confirm, handleConfirm, visible } = useConfirmDialog()

    confirm({ title: 'T', message: 'M', confirmText: 'Y', cancelText: 'N' })
    handleConfirm()

    expect(visible.value).toBe(false)
  })

  it('hides dialog after cancel', () => {
    const { confirm, handleCancel, visible } = useConfirmDialog()

    confirm({ title: 'T', message: 'M', confirmText: 'Y', cancelText: 'N' })
    handleCancel()

    expect(visible.value).toBe(false)
  })

  it('handles sequential confirm calls', async () => {
    const { confirm, handleConfirm } = useConfirmDialog()

    const p1 = confirm({ title: 'A', message: 'A?', confirmText: 'Y', cancelText: 'N' })
    handleConfirm()
    await expect(p1).resolves.toBe(true)

    const p2 = confirm({ title: 'B', message: 'B?', confirmText: 'Y', cancelText: 'N' })
    handleConfirm()
    await expect(p2).resolves.toBe(true)
  })

  it('handles sequential cancel calls', async () => {
    const { confirm, handleCancel } = useConfirmDialog()

    const p1 = confirm({ title: 'A', message: 'A?', confirmText: 'Y', cancelText: 'N' })
    handleCancel()
    await expect(p1).resolves.toBe(false)

    const p2 = confirm({ title: 'B', message: 'B?', confirmText: 'Y', cancelText: 'N' })
    handleCancel()
    await expect(p2).resolves.toBe(false)
  })

  it('overwrites options on subsequent confirm call', () => {
    const { confirm, options } = useConfirmDialog()

    confirm({ title: 'First', message: 'M1', confirmText: 'Y', cancelText: 'N' })
    confirm({ title: 'Second', message: 'M2', confirmText: 'Y', cancelText: 'N' })

    expect(options.value.title).toBe('Second')
  })

  it('is a singleton across multiple calls', () => {
    const { visible, options } = useConfirmDialog()
    const { visible: visible2, options: options2 } = useConfirmDialog()

    expect(visible).toBe(visible2)
    expect(options).toBe(options2)
  })
})
