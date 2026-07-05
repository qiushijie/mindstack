import { ref, shallowRef, onMounted, onUnmounted, watch, type Ref } from 'vue'
import { EditorView, ViewUpdate } from '@codemirror/view'
import { EditorState, Extension, Compartment } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { keymap } from '@codemirror/view'
import { createEditorTheme } from '../extensions/theme'
import { createKeymapExtension } from '../extensions/keymap'
import { markdownStyles, checkboxClickHandler, imageClickHandler } from '../extensions/markdownStyles'
import { currentFilePathExtension, setCurrentFilePath } from '../extensions/currentFilePath'
import { tablePlugin, tableEditHandler } from '../extensions/tableWidget'
import { mathPlugin, mathEditHandler } from '../extensions/mathWidget'
import { mermaidPlugin } from '../extensions/mermaidWidget'
import { createBlockGutter } from '../extensions/blockGutter'
import { createDragSort } from '../extensions/dragSort'
import { createInputHandler } from '../extensions/inputHandler'
import { createSlashCommand } from '../extensions/slashCommand'
import { emptyLinePlaceholder } from '../extensions/emptyLinePlaceholder'
import { useEditorState, sharedEditorAdapter, sharedCommandRunner } from './useEditorState'
import { useFileTree } from './useFileTree'
import { CodeMirrorAdapter } from '../editor/codemirror/CodeMirrorAdapter'
import { CommandRunner } from '../editor/commands/CommandRunner'
import { CodeMirrorMarkdownSemanticService } from '../editor/commands/CodeMirrorMarkdownSemanticService'

interface UseCodeMirrorOptions {
  container: Ref<HTMLElement | null>
  initialDoc?: string
  extensions?: Extension[]
  rawMode?: Ref<boolean>
  onChange?: (doc: string) => void
  onSelectionChange?: (state: EditorState) => void
  onScroll?: (topLine: number) => void
  onSearchToggle?: () => void
  onTransaction?: () => void
}

interface UseCodeMirrorReturn {
  view: Readonly<ShallowRef<EditorView | null>>
  doc: Ref<string>
  focus: () => void
  destroy: () => void
  setContent: (content: string) => void
}

type ShallowRef<T> = ReturnType<typeof shallowRef<T>>

function isDarkTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

export function useCodeMirror(options: UseCodeMirrorOptions): UseCodeMirrorReturn {
  const themeCompartment = new Compartment()
  const extCompartment = new Compartment()
  const richCompartment = new Compartment()
  const view = shallowRef<EditorView | null>(null)
  const doc = ref(options.initialDoc ?? '')
  const { editorView: sharedView } = useEditorState()
  let themeObserver: MutationObserver | null = null

  let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null

  function getRichExtensions(): Extension[] {
    if (options.rawMode?.value) return []
    return [
      markdownStyles,
      checkboxClickHandler,
      imageClickHandler,
      tablePlugin,
      tableEditHandler,
      mathPlugin,
      mathEditHandler,
      mermaidPlugin,
      ...createBlockGutter(),
      ...createDragSort(),
      createInputHandler(),
      createSlashCommand(),
      emptyLinePlaceholder,
    ]
  }

  function getBaseExtensions(): Extension[] {
    return [
      themeCompartment.of(createEditorTheme(isDarkTheme())),
      markdown({ extensions: GFM, codeLanguages: languages }),
      history(),
      keymap.of([
        { key: 'Mod-f', run: () => { options.onSearchToggle?.(); return true } },
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
      ]),
      createKeymapExtension(),
      search(),
      currentFilePathExtension(),
      richCompartment.of(getRichExtensions()),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          doc.value = update.state.doc.toString()
          options.onChange?.(doc.value)
        }
        if (update.selectionSet || update.docChanged) {
          options.onSelectionChange?.(update.state)
        }
        options.onTransaction?.()
      }),
      EditorView.domEventHandlers({
        scroll: (_e, v) => {
          if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
          scrollDebounceTimer = setTimeout(() => {
            const block = v.lineBlockAtHeight(v.scrollDOM.scrollTop)
            const line = v.state.doc.lineAt(block.from).number
            options.onScroll?.(line)
          }, 50)
        },
      }),
    ]
  }

  onMounted(() => {
    if (!options.container.value) return

    const state = EditorState.create({
      doc: options.initialDoc ?? '',
      extensions: [
        ...getBaseExtensions(),
        extCompartment.of(options.extensions ?? []),
      ],
    })

    view.value = new EditorView({
      state,
      parent: options.container.value,
    })
    sharedView.value = view.value
    const adapter = new CodeMirrorAdapter(view.value)
    sharedEditorAdapter.value = adapter
    sharedCommandRunner.value = new CommandRunner({
      adapter,
      semantics: new CodeMirrorMarkdownSemanticService(view.value),
    })

    // Sync current file path and content into editor state
    const { selectedFilePath, selectedFileContent } = useFileTree()
    if (selectedFilePath.value) {
      view.value.dispatch({ effects: setCurrentFilePath.of(selectedFilePath.value) })
    }
    if (selectedFileContent.value) {
      setContent(selectedFileContent.value)
    }

    // Watch for theme changes and reconfigure editor theme
    themeObserver = new MutationObserver(() => {
      if (!view.value) return
      view.value.dispatch({
        effects: themeCompartment.reconfigure(createEditorTheme(isDarkTheme())),
      })
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  })

  onUnmounted(() => {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer)
    themeObserver?.disconnect()
    view.value?.destroy()
    view.value = null
    sharedView.value = null
    sharedEditorAdapter.value = null
    sharedCommandRunner.value = null
  })

  function setContent(content: string) {
    if (!view.value) return
    view.value.dispatch({
      changes: { from: 0, to: view.value.state.doc.length, insert: content },
      selection: { anchor: 0 },
    })
  }

  function focus() {
    view.value?.focus()
  }

  function destroy() {
    themeObserver?.disconnect()
    view.value?.destroy()
    sharedView.value = null
    sharedEditorAdapter.value = null
    sharedCommandRunner.value = null
    view.value = null
  }

  watch(() => options.extensions, (newExts) => {
    if (view.value && newExts) {
      view.value.dispatch({
        effects: extCompartment.reconfigure(newExts),
      })
    }
  })

  if (options.rawMode) {
    watch(options.rawMode, () => {
      if (!view.value) return
      view.value.dispatch({
        effects: richCompartment.reconfigure(getRichExtensions()),
      })
    })
  }

  return { view, doc, focus, destroy, setContent }
}
