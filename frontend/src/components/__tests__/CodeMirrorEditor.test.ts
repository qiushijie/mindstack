import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import CodeMirrorEditor from '../CodeMirrorEditor.vue'

const mockRun = vi.fn()
const mockCommandRunner = { run: mockRun }

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../wailsjs/go/main/App', () => ({
  OpenImageFileDialog: vi.fn(),
}))

vi.mock('../../composables/useCodeMirror', () => ({
  useCodeMirror: () => ({
    view: ref({
      state: {
        field: vi.fn(() => ''),
      },
    }),
    doc: ref(''),
    focus: vi.fn(),
    destroy: vi.fn(),
    setContent: vi.fn(),
  }),
}))

vi.mock('../../composables/useFileTree', () => ({
  useFileTree: () => ({
    markDirty: vi.fn(),
    selectedFileContent: ref(''),
    clearEditorAdapter: vi.fn(),
    setEditorAdapter: vi.fn(),
  }),
}))

vi.mock('../../composables/useEditorState', () => ({
  useEditorState: () => ({
    editorView: ref(null),
    editorAdapter: ref(null),
    commandRunner: ref(mockCommandRunner),
  }),
  provideEditorState: () => ({
    editorView: ref(null),
    editorAdapter: ref(null),
    commandRunner: ref(mockCommandRunner),
  }),
}))

vi.mock('../../composables/useSettings', () => ({
  useSettings: () => ({
    rawMode: ref(false),
  }),
}))

vi.mock('../../composables/useHeadingTree', () => ({
  setSelectedHeadingLine: vi.fn(),
  currentHeadings: ref([]),
}))

function getImageDialog() {
  return document.body.querySelector('.image-dialog-overlay') as HTMLElement | null
}

function findWithinDialog(selector: string): Element | null {
  return getImageDialog()?.querySelector(selector) ?? null
}

describe('CodeMirrorEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('should use fallback alt when inserting an image with empty alt', async () => {
    const wrapper = mount(CodeMirrorEditor, {
      attachTo: document.body,
    })
    await nextTick()

    const container = wrapper.find('.cm-container').element as HTMLElement
    container.dispatchEvent(new CustomEvent('editor:insert-image', {
      detail: { lineFrom: 0 },
      bubbles: true,
    }))
    await nextTick()

    expect(getImageDialog()).not.toBeNull()

    const urlInput = findWithinDialog('.image-dialog-input') as HTMLInputElement | null
    expect(urlInput).not.toBeNull()
    urlInput!.value = 'image.png'
    urlInput!.dispatchEvent(new Event('input'))
    await nextTick()

    const insertBtn = findWithinDialog('.image-dialog-btn-insert') as HTMLButtonElement | null
    expect(insertBtn).not.toBeNull()
    expect(insertBtn!.disabled).toBe(false)
    insertBtn!.click()
    await nextTick()

    expect(mockRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: 'image.png',
        alt: 'imageDialog.altPlaceholder',
        lineFrom: 0,
      }),
    )
  })

  it('should keep provided alt when inserting an image with non-empty alt', async () => {
    const wrapper = mount(CodeMirrorEditor, {
      attachTo: document.body,
    })
    await nextTick()

    const container = wrapper.find('.cm-container').element as HTMLElement
    container.dispatchEvent(new CustomEvent('editor:insert-image', {
      detail: { lineFrom: 0 },
      bubbles: true,
    }))
    await nextTick()

    const inputs = getImageDialog()?.querySelectorAll('.image-dialog-input')
    expect(inputs?.length).toBeGreaterThanOrEqual(2)

    const urlInput = inputs![0] as HTMLInputElement
    const altInput = inputs![1] as HTMLInputElement
    urlInput.value = 'image.png'
    urlInput.dispatchEvent(new Event('input'))
    altInput.value = 'my alt'
    altInput.dispatchEvent(new Event('input'))
    await nextTick()

    const insertBtn = findWithinDialog('.image-dialog-btn-insert') as HTMLButtonElement | null
    insertBtn!.click()
    await nextTick()

    expect(mockRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: 'image.png',
        alt: 'my alt',
        lineFrom: 0,
      }),
    )
  })
})
