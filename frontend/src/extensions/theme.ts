import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--font-size-lg)',
    color: 'var(--foreground-secondary)',
    backgroundColor: 'var(--surface-primary)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '48px 120px 120px 12px',
    caretColor: 'var(--accent-primary)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent-primary)',
    borderLeftWidth: '2px',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'rgba(0, 102, 255, 0.15) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--foreground-tertiary)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  '.cm-line': {
    padding: '2px 0',
  },
  '&.cm-focused': {
    outline: 'none',
  },

  // Blockquote
  '.cm-blockquote-line': {
    borderLeft: '3px solid var(--accent-primary)',
    paddingLeft: '20px',
    fontStyle: 'italic',
    color: 'var(--foreground-secondary)',
  },

  // List
  '.cm-list-item': {
    listStyle: 'none',
  },
  '.cm-bullet': {
    color: 'var(--foreground-tertiary)',
    marginRight: '8px',
    userSelect: 'none',
  },
  '.cm-list-num': {
    color: 'var(--foreground-tertiary)',
    marginRight: '8px',
    userSelect: 'none',
  },

  // Code block
  '.cm-code-block': {
    backgroundColor: 'var(--code-bg)',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
    marginTop: '4px',
    marginBottom: '4px',
  },
  '.cm-code-header': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '20px',
    padding: '12px 20px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--foreground-tertiary)',
  },
  '.cm-code-lang': {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--foreground-tertiary)',
  },
  '.cm-code-line': {
    fontFamily: 'var(--font-mono)',
    fontSize: '13px',
    lineHeight: '1.6',
    color: 'var(--foreground-secondary)',
    padding: '0 20px',
  },

  // Todo checkbox
  '.cm-todo-check': {
    display: 'inline-block',
    width: '16px',
    height: '16px',
    border: '2px solid var(--foreground-tertiary)',
    borderRadius: '3px',
    verticalAlign: 'middle',
    marginRight: '8px',
    cursor: 'pointer',
  },
  '.cm-todo-check.done': {
    backgroundColor: 'var(--accent-primary)',
    borderColor: 'var(--accent-primary)',
    position: 'relative',
  },
  '.cm-todo-check.done::after': {
    content: '""',
    position: 'absolute',
    left: '3px',
    top: '0px',
    width: '5px',
    height: '9px',
    border: 'solid var(--foreground-inverse)',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)',
  },

  // HR
  '.cm-hr': {
    border: 'none',
    borderTop: '1px solid var(--border-subtle)',
    margin: '16px 0',
  },

  // Block controls gutter — rendered outside .cm-content, no cursor interference
  '.cm-block-gutter': {
    width: '160px',
  },
  '.cm-block-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 4px 0 0',
  },
  '.cm-block-controls': {
    display: 'flex',
    gap: '2px',
    opacity: '0',
    transition: 'opacity 0.15s ease',
  },
  '.cm-block-gutter .cm-gutterElement:hover .cm-block-controls': {
    opacity: '1',
  },
  '&.cm-drag-cooldown .cm-block-gutter .cm-gutterElement:hover .cm-block-controls': {
    opacity: '0 !important',
  },
  '&.cm-drag-cooldown .cm-active-block .cm-block-controls': {
    opacity: '0 !important',
  },
  '.cm-block-gutter .cm-active-block .cm-block-controls': {
    opacity: '1',
  },
  '.cm-block-btn': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    border: 'none',
    background: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--foreground-tertiary)',
    padding: '0',
  },
  '.cm-block-btn:hover': {
    backgroundColor: 'var(--surface-hover)',
    color: 'var(--foreground-secondary)',
  },
  '.cm-block-btn:focus-visible': {
    outline: '2px solid var(--accent-primary)',
    outlineOffset: '-2px',
    borderRadius: '4px',
  },
  '.cm-block-btn:active': {
    transform: 'scale(0.95)',
    backgroundColor: 'var(--surface-active)',
  },
  '.cm-block-drag': {
    cursor: 'grab',
  },

  // Drop indicator for drag-reorder
  '.cm-drop-indicator': {
    height: '3px',
    backgroundColor: 'var(--accent-primary)',
    borderRadius: '1.5px',
    margin: '0',
    width: '100%',
  },

  // Target line indicator (blue top border via box-shadow)
  '.cm-drag-target': {
    boxShadow: 'inset 0 2px 0 0 var(--accent-primary)',
  },

  // Source block during drag
  '.cm-drag-source': {
    opacity: '0.35',
    transition: 'opacity 0.15s ease',
  },

  // Slash command menu
  '.cm-slash-menu': {
    position: 'absolute',
    top: '100%',
    left: '0',
    marginTop: '4px',
    backgroundColor: 'var(--surface-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '4px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
    minWidth: '220px',
    zIndex: '100',
  },
  '.cm-slash-item': {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    gap: '12px',
  },
  '.cm-slash-item:hover, .cm-slash-active': {
    backgroundColor: 'var(--surface-hover)',
  },
  '.cm-slash-label': {
    fontSize: 'var(--font-size-md)',
    color: 'var(--foreground-primary)',
    fontWeight: '500',
  },
  '.cm-slash-desc': {
    fontSize: 'var(--font-size-xs)',
    color: 'var(--foreground-tertiary)',
  },
  '.cm-slash-empty': {
    padding: '8px 12px',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--foreground-tertiary)',
  },

  // Table widget
  '.cm-table-widget': {
    borderCollapse: 'separate' as unknown as string,
    borderSpacing: '0',
    width: '100%',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid var(--border-strong)',
    fontSize: 'var(--font-size-md)',
    fontFamily: 'var(--font-sans)',
    tableLayout: 'fixed' as unknown as string,
  },
  '.cm-table-widget thead': {
    backgroundColor: 'var(--surface-secondary)',
  },
  '.cm-table-widget th': {
    padding: '10px 16px',
    textAlign: 'left' as unknown as string,
    fontWeight: '600',
    color: 'var(--foreground-primary)',
    fontSize: 'var(--font-size-sm)',
    borderRight: '1px solid var(--border-subtle)',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'default',
  },
  '.cm-table-widget th:last-child': {
    borderRight: 'none',
  },
  '.cm-table-widget td': {
    padding: '10px 16px',
    textAlign: 'left' as unknown as string,
    color: 'var(--foreground-primary)',
    borderRight: '1px solid var(--border-subtle)',
    borderBottom: '1px solid var(--border-subtle)',
    cursor: 'text',
  },
  '.cm-table-widget td:last-child': {
    borderRight: 'none',
  },
  '.cm-table-widget tbody tr:last-child td': {
    borderBottom: 'none',
  },
  '.cm-table-widget tbody tr:hover': {
    backgroundColor: 'var(--surface-hover)',
  },
}, { dark: false })

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.75rem', fontWeight: '700', color: 'var(--foreground-primary)', lineHeight: '1.3' },
  { tag: tags.heading2, fontSize: '1.5rem', fontWeight: '600', color: 'var(--foreground-primary)', lineHeight: '1.3' },
  { tag: tags.heading3, fontSize: '1.25rem', fontWeight: '600', color: 'var(--foreground-primary)', lineHeight: '1.3' },
  { tag: tags.heading4, fontSize: '1.125rem', fontWeight: '600', color: 'var(--foreground-primary)', lineHeight: '1.4' },
  { tag: tags.heading5, fontSize: '1rem', fontWeight: '600', color: 'var(--foreground-primary)', lineHeight: '1.4' },
  { tag: tags.heading6, fontSize: '1rem', fontWeight: '600', color: 'var(--foreground-primary)', lineHeight: '1.4' },
  { tag: tags.strong, fontWeight: '600', color: 'var(--foreground-primary)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--foreground-tertiary)' },
  { tag: tags.link, color: 'var(--accent-primary)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--accent-primary)' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.875em', backgroundColor: 'var(--code-inline-bg)', borderRadius: '3px', padding: '1px 4px' },
  { tag: tags.quote, color: 'var(--foreground-secondary)', fontStyle: 'italic' },
  { tag: tags.meta, color: 'var(--foreground-tertiary)' },
  { tag: tags.processingInstruction, color: 'var(--foreground-tertiary)' },
  { tag: tags.comment, color: 'var(--foreground-tertiary)' },
  { tag: tags.keyword, color: 'var(--accent-primary)' },
  { tag: tags.string, color: '#2E7D32' },
  { tag: tags.number, color: '#C2185B' },
  { tag: tags.bool, color: '#C2185B' },
])

export function createEditorTheme(): Extension[] {
  return [editorTheme, syntaxHighlighting(highlightStyle)]
}
