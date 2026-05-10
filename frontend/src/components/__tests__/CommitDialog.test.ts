import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import CommitDialog from '../CommitDialog.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, string>) => {
    if (params?.error) return `${key}: ${params.error}`
    return key
  } }),
}))

const mockGitStatus = vi.fn()
const mockGitCommitFiles = vi.fn()
const mockGitPush = vi.fn()
const mockGitGenerateCommitMessage = vi.fn()

vi.mock('../../../wailsjs/go/main/App', () => ({
  GitStatus: (...args: any[]) => mockGitStatus(...args),
  GitCommitFiles: (...args: any[]) => mockGitCommitFiles(...args),
  GitPush: (...args: any[]) => mockGitPush(...args),
  GitGenerateCommitMessage: (...args: any[]) => mockGitGenerateCommitMessage(...args),
}))

function getDialogElement() {
  return document.body.querySelector('.commit-dialog-overlay')
}

function findWithinDialog(selector: string): Element | null {
  return getDialogElement()?.querySelector(selector) ?? null
}

function mountComponent(props = { visible: false }) {
  return mount(CommitDialog, {
    props,
    attachTo: document.body,
  })
}

async function openDialog(wrapper: ReturnType<typeof mountComponent>) {
  mockGitStatus.mockResolvedValue(JSON.stringify({
    files: [
      { path: 'README.md', staged: 'M', unstaged: '' },
    ],
  }))
  await wrapper.setProps({ visible: true })
  await nextTick()
  await nextTick()
}

describe('CommitDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGitStatus.mockResolvedValue(JSON.stringify({ clean: true }))
    document.body.innerHTML = ''
  })

  it('should not render when visible is false', () => {
    mountComponent({ visible: false })
    expect(getDialogElement()).toBeNull()
  })

  it('should render when visible is true', async () => {
    mountComponent({ visible: true })
    await nextTick()
    expect(getDialogElement()).not.toBeNull()
  })

  it('should have pushAfterCommit unchecked by default', async () => {
    mountComponent({ visible: true })
    await nextTick()
    const checkbox = findWithinDialog('.push-after-checkbox')
    expect(checkbox?.classList.contains('checked')).toBe(false)
  })

  it('should toggle pushAfterCommit checkbox on click', async () => {
    mountComponent({ visible: true })
    await nextTick()
    const label = findWithinDialog('.push-after-commit')
    expect(label).not.toBeNull()
    ;(label as HTMLElement).click()
    await nextTick()
    expect(findWithinDialog('.push-after-checkbox')?.classList.contains('checked')).toBe(true)
    ;(label as HTMLElement).click()
    await nextTick()
    expect(findWithinDialog('.push-after-checkbox')?.classList.contains('checked')).toBe(false)
  })

  it('should reset pushAfterCommit when dialog reopens', async () => {
    const wrapper = mountComponent({ visible: true })
    await nextTick()
    const label = findWithinDialog('.push-after-commit')
    ;(label as HTMLElement).click()
    await nextTick()
    expect(findWithinDialog('.push-after-checkbox')?.classList.contains('checked')).toBe(true)

    await wrapper.setProps({ visible: false })
    await nextTick()
    mockGitStatus.mockResolvedValue(JSON.stringify({ clean: true }))
    await wrapper.setProps({ visible: true })
    await nextTick()
    expect(findWithinDialog('.push-after-checkbox')?.classList.contains('checked')).toBe(false)
  })

  it('should commit without push when checkbox is unchecked', async () => {
    mockGitCommitFiles.mockResolvedValue(JSON.stringify({ ok: true }))
    const wrapper = mountComponent({ visible: false })
    await openDialog(wrapper)

    const textarea = findWithinDialog('.commit-msg-textarea') as HTMLTextAreaElement
    textarea.value = 'test commit'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const commitBtn = findWithinDialog('.commit-btn-primary') as HTMLButtonElement
    commitBtn.click()
    await nextTick()

    expect(mockGitCommitFiles).toHaveBeenCalledWith('test commit', ['README.md'])
    expect(mockGitPush).not.toHaveBeenCalled()
  })

  it('should commit and push when checkbox is checked', async () => {
    mockGitCommitFiles.mockResolvedValue(JSON.stringify({ ok: true }))
    mockGitPush.mockResolvedValue(JSON.stringify({ ok: true }))
    const wrapper = mountComponent({ visible: false })
    await openDialog(wrapper)

    const label = findWithinDialog('.push-after-commit')
    ;(label as HTMLElement).click()
    await nextTick()

    const textarea = findWithinDialog('.commit-msg-textarea') as HTMLTextAreaElement
    textarea.value = 'test commit with push'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const commitBtn = findWithinDialog('.commit-btn-primary') as HTMLButtonElement
    commitBtn.click()
    await nextTick()

    expect(mockGitCommitFiles).toHaveBeenCalledWith('test commit with push', ['README.md'])
    expect(mockGitPush).toHaveBeenCalled()
  })

  it('should not call GitPush when commit fails', async () => {
    mockGitCommitFiles.mockResolvedValue(JSON.stringify({ error: 'commit failed' }))
    const wrapper = mountComponent({ visible: false })
    await openDialog(wrapper)

    const label = findWithinDialog('.push-after-commit')
    ;(label as HTMLElement).click()
    await nextTick()

    const textarea = findWithinDialog('.commit-msg-textarea') as HTMLTextAreaElement
    textarea.value = 'test'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const commitBtn = findWithinDialog('.commit-btn-primary') as HTMLButtonElement
    commitBtn.click()
    await flushPromises()
    await nextTick()

    expect(mockGitPush).not.toHaveBeenCalled()
    const statusEl = findWithinDialog('.commit-dialog-status')
    expect(statusEl?.textContent || '').toContain('commit failed')
  })

  it('should emit commit-success and close when push fails', async () => {
    mockGitCommitFiles.mockResolvedValue(JSON.stringify({ ok: true }))
    mockGitPush.mockResolvedValue(JSON.stringify({ error: 'push rejected' }))
    const wrapper = mountComponent({ visible: false })
    await openDialog(wrapper)

    const label = findWithinDialog('.push-after-commit')
    ;(label as HTMLElement).click()
    await nextTick()

    const textarea = findWithinDialog('.commit-msg-textarea') as HTMLTextAreaElement
    textarea.value = 'test'
    textarea.dispatchEvent(new Event('input'))
    await nextTick()

    const commitBtn = findWithinDialog('.commit-btn-primary') as HTMLButtonElement
    commitBtn.click()
    await flushPromises()
    await nextTick()

    expect(mockGitPush).toHaveBeenCalled()
    expect(wrapper.emitted('commit-success')).toBeTruthy()
    expect(wrapper.emitted('close')).toBeTruthy()
    const statusEl = findWithinDialog('.commit-dialog-status')
    expect(statusEl?.textContent || '').toContain('push rejected')
  })
})
