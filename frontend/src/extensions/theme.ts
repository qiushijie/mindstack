import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

function buildEditorTheme(dark: boolean) {
  return EditorView.theme({
    '&': {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      fontSize: 'var(--font-size-lg)',
      color: 'var(--foreground-secondary)',
      backgroundColor: 'var(--surface-primary)',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'inherit',
      flex: '1',
      minHeight: '0',
    },
    '.cm-content': {
      padding: '48px 120px 120px 12px',
      caretColor: 'var(--accent-primary)',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent-primary)',
      borderLeftWidth: '2px',
    },
    '.cm-content ::selection': {
      backgroundColor: dark ? '#4a7ad0' : '#b8d4f8',
      color: dark ? '#ffffff' : 'inherit',
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
      backgroundColor: dark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    },
    '.cm-line': {
      padding: '2px 0',
      position: 'relative' as unknown as string,
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
    '.cm-blockquote-line.cm-code-line': {
      fontStyle: 'normal',
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

    // Code block lines: background directly on each line, no gaps
    '.cm-code-block': {
      backgroundColor: 'var(--code-bg)',
      borderLeft: '1px solid var(--border-subtle)',
      borderRight: '1px solid var(--border-subtle)',
    },
    '.cm-code-first': {
      borderTop: '1px solid var(--border-subtle)',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      paddingTop: '2px',
      lineHeight: '0',
    },
    '.cm-code-first .cm-widgetBuffer': {
      verticalAlign: 'top',
    },
    '.cm-code-last': {
      borderBottom: '1px solid var(--border-subtle)',
      borderBottomLeftRadius: '8px',
      borderBottomRightRadius: '8px',
      paddingBottom: '2px',
      lineHeight: '0',
      fontSize: '0',
      minHeight: '4px',
    },
    '.cm-code-header': {
      display: 'inline-flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '2px 20px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      color: 'var(--foreground-tertiary)',
      lineHeight: 'var(--line-height-base, 1.4)',
    },
    '.cm-code-lang': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      color: 'var(--foreground-tertiary)',
      cursor: 'pointer',
      userSelect: 'none',
    },
    '.cm-code-lang-dropdown': {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: '0',
      backgroundColor: 'var(--surface-primary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '6px',
      padding: '4px 0',
      boxShadow: dark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.1)',
      zIndex: '100',
      maxHeight: '220px',
      overflowY: 'auto',
      minWidth: '120px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
    },
    '.cm-code-lang-item': {
      padding: '5px 14px',
      cursor: 'pointer',
      color: 'var(--foreground-secondary)',
      transition: 'background-color 0.1s',
    },
    '.cm-code-lang-item:hover, .cm-code-lang-item.active': {
      backgroundColor: 'var(--surface-hover)',
      color: 'var(--foreground-primary)',
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
      padding: '16px 0',
    },

    // Image-only lines
    '.cm-image-line': {
      lineHeight: '0',
      fontSize: '0',
      paddingBottom: '8px',
    },
    '.cm-image-container': {
      maxWidth: '100%',
      borderRadius: '4px',
      overflow: 'hidden',
      cursor: 'text',
      border: '1px solid var(--border-subtle)',
      backgroundColor: 'var(--surface-secondary)',
    },
    '.cm-image': {
      maxWidth: '100%',
      display: 'block',
    },
    '.cm-image-caption': {
      fontSize: 'var(--font-size-sm)',
      color: 'var(--foreground-tertiary)',
      textAlign: 'center' as unknown as string,
      padding: '4px 8px 8px',
    },
    '.cm-image-error': {
      padding: '16px',
      textAlign: 'center' as unknown as string,
      color: 'var(--foreground-tertiary)',
      fontSize: 'var(--font-size-sm)',
    },
    '.cm-image-load-error .cm-image': {
      minHeight: '48px',
      opacity: '0.3',
    },
    '.cm-image-placeholder': {
      padding: '16px',
      textAlign: 'center' as unknown as string,
      color: 'var(--foreground-tertiary)',
      fontSize: 'var(--font-size-sm)',
      border: '1px dashed var(--border-subtle)',
      borderRadius: '4px',
    },
    '.cm-image-editing': {
      backgroundColor: dark ? 'rgba(0, 102, 255, 0.08)' : 'rgba(0, 102, 255, 0.05)',
      borderRadius: '4px',
    },

    // Block controls gutter
    '.cm-block-gutter': {
      width: '160px',
    },
    '.cm-block-gutter .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      padding: '0 4px 0 0',
    },
    '.cm-block-gutter .cm-block-type-image': {
      alignItems: 'flex-start',
      padding: '2px 4px 0 0',
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

    // Target line indicator
    '.cm-drag-target': {
      boxShadow: 'inset 0 2px 0 0 var(--accent-primary)',
    },

    // Source block during drag
    '.cm-drag-source': {
      opacity: '0.35',
      transition: 'opacity 0.15s ease',
    },

    // Slash command menu
    '&.cm-slash-menu-active .cm-cursor, &.cm-slash-menu-active .cm-cursor-primary, &.cm-slash-menu-active .cm-cursor-secondary': {
      display: 'none !important',
    },
    '.cm-slash-menu': {
      position: 'absolute',
      top: '100%',
      left: '0',
      marginTop: '4px',
      backgroundColor: 'var(--surface-primary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      padding: '4px',
      boxShadow: dark ? '0 4px 16px rgba(0, 0, 0, 0.4)' : '0 4px 16px rgba(0, 0, 0, 0.1)',
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
    '.cm-empty-line-placeholder': {
      color: 'var(--foreground-tertiary)',
      fontSize: 'var(--font-size-md)',
      opacity: '0.5',
      pointerEvents: 'none',
      userSelect: 'none',
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

    // Math
    '.cm-math-inline': {
      display: 'inline-block',
      cursor: 'pointer',
      verticalAlign: 'middle',
    },
    '.cm-math-inline .katex': {
      color: dark ? 'var(--foreground-primary)' : 'inherit',
      fontSize: '1.05em',
    },
    '.cm-math-block': {
      display: 'block',
      cursor: 'pointer',
      padding: '12px 0',
      textAlign: 'center' as unknown as string,
      overflowX: 'auto' as unknown as string,
    },
    '.cm-math-block .katex': {
      color: dark ? 'var(--foreground-primary)' : 'inherit',
      fontSize: '1.15em',
    },
    '.cm-math-block .katex-display': {
      margin: '0',
    },
    '.cm-math-error': {
      color: 'var(--accent-error, #ef4444)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: dark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
    },

    // Mermaid
    '.cm-mermaid-preview': {
      border: '1px solid var(--border-subtle)',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: 'var(--surface-primary)',
      cursor: 'text',
    },
    '.cm-mermaid-preview-header': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      height: '36px',
      backgroundColor: 'var(--surface-secondary)',
      gap: '8px',
    },
    '.cm-mermaid-sep': {
      height: '1px',
      backgroundColor: 'var(--border-subtle)',
    },
    '.cm-mermaid-preview-area': {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px',
      minHeight: '120px',
      backgroundColor: 'var(--surface-secondary)',
    },
    '.cm-mermaid-preview-area svg': {
      maxWidth: '100%',
    },
    '.cm-mermaid-badge': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-xs)',
      fontWeight: '600',
      color: 'var(--foreground-tertiary)',
    },
    '.cm-mermaid-edit-btn, .cm-mermaid-preview-btn': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '0 8px',
      height: '24px',
      border: 'none',
      borderRadius: '4px',
      backgroundColor: 'var(--surface-hover)',
      color: 'var(--foreground-secondary)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--font-size-xs)',
      fontWeight: 'normal',
      cursor: 'pointer',
      lineHeight: '1',
    },
    '.cm-mermaid-edit-btn:hover, .cm-mermaid-preview-btn:hover': {
      backgroundColor: 'var(--surface-active)',
    },
    '.cm-mermaid-error': {
      color: 'var(--accent-error, #ef4444)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      padding: '8px 12px',
      borderRadius: '4px',
      backgroundColor: dark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
    },

    // Mermaid editing mode
    '.cm-mermaid-edit-header': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      height: '36px',
      backgroundColor: 'var(--surface-secondary)',
      gap: '8px',
    },
    '.cm-mermaid-edit-header-left': {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    '.cm-mermaid-block': {
      backgroundColor: 'var(--code-bg)',
      borderLeft: '2px solid var(--accent-primary)',
      borderRight: '2px solid var(--accent-primary)',
    },
    '.cm-mermaid-first': {
      borderTop: '2px solid var(--accent-primary)',
      borderTopLeftRadius: '8px',
      borderTopRightRadius: '8px',
      paddingTop: '2px',
      lineHeight: '0',
    },
    '.cm-mermaid-first .cm-widgetBuffer': {
      height: '0 !important',
      verticalAlign: 'top',
    },
    '.cm-mermaid-last': {
      borderBottom: '2px solid var(--accent-primary)',
      borderBottomLeftRadius: '8px',
      borderBottomRightRadius: '8px',
      paddingBottom: '2px',
      lineHeight: '0',
      fontSize: '0',
      minHeight: '4px',
    },
    '.cm-mermaid-line': {
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      lineHeight: '1.6',
      color: 'var(--foreground-secondary)',
      padding: '0 20px',
    },

    // Search panel (hidden — using custom FindPanel.vue instead)
    '.cm-panels': {
      display: 'none',
    },
    '.cm-searchMatch': {
      backgroundColor: dark ? '#92400e' : '#fcd34d',
    },
    '.cm-searchMatch-selected': {
      backgroundColor: dark ? '#b45309' : '#fbbf24',
    },
  }, { dark })
}

const baseHighlightTags = [
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
]

const lightCodeTags = [
  { tag: tags.string, color: '#2E7D32' },
  { tag: tags.number, color: '#C2185B' },
  { tag: tags.bool, color: '#C2185B' },
]

const darkCodeTags = [
  { tag: tags.string, color: '#81C784' },
  { tag: tags.number, color: '#F06292' },
  { tag: tags.bool, color: '#F06292' },
]

const lightHighlightStyle = HighlightStyle.define([...baseHighlightTags, ...lightCodeTags])
const darkHighlightStyle = HighlightStyle.define([...baseHighlightTags, ...darkCodeTags])

export function createEditorTheme(dark = false): Extension[] {
  return [buildEditorTheme(dark), syntaxHighlighting(dark ? darkHighlightStyle : lightHighlightStyle)]
}
