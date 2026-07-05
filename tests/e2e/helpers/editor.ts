import { Page, Locator } from '@playwright/test'

export interface EditorAdapterLike {
  getContent(): string
  setContent(content: string, options?: { preserveSelection?: boolean }): void
  getSelection(): { anchor: number; head: number }
  setSelection(selection: { anchor: number; head?: number }, options?: { scroll?: boolean }): void
  replaceRange(change: { from: number; to: number; insert: string }, options?: { selection?: { anchor: number; head?: number } }): void
  focus(): void
  moveCursorToEnd(): void
  coordsAtPos?(pos: number): DOMRect | null
}

export async function getContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.getContent) {
      return adapter.getContent()
    }
    const view = (window as any).__cmView
    return view?.state?.doc?.toString() ?? ''
  })
}

export async function setContent(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.setContent) {
      adapter.setContent(t)
      return
    }
    const view = (window as any).__cmView
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: t },
        selection: { anchor: 0 },
      })
    }
  }, text)
}

export async function clearEditor(page: Page): Promise<void> {
  await setContent(page, '')
}

export async function moveCursorToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.moveCursorToEnd) {
      adapter.moveCursorToEnd()
      return
    }
    const view = (window as any).__cmView
    if (view) {
      view.dispatch({ selection: { anchor: view.state.doc.length } })
    }
  })
}

export async function focusEditor(page: Page): Promise<void> {
  await page.locator('.cm-content').click()
  await page.waitForTimeout(200)
}

export async function typeInEditor(page: Page, text: string): Promise<void> {
  await focusEditor(page)
  await page.keyboard.type(text, { delay: 10 })
}

export async function selectAll(page: Page): Promise<void> {
  await page.keyboard.press('Meta+A')
}

export async function getStatusText(page: Page): Promise<string[]> {
  const items = page.locator('.status-bar .status-item')
  const count = await items.count()
  const texts: string[] = []
  for (let i = 0; i < count; i++) {
    texts.push((await items.nth(i).textContent()) ?? '')
  }
  return texts
}

export function getToolbarButton(page: Page, label: string): Locator {
  return page.locator('.selection-toolbar .toolbar-btn').filter({ hasText: new RegExp(label) })
}

export async function selectTextBackward(page: Page, chars: number): Promise<void> {
  await page.keyboard.down('Shift')
  for (let i = 0; i < chars; i++) {
    await page.keyboard.press('ArrowLeft')
  }
  await page.keyboard.up('Shift')
}

/**
 * Set the cursor position or selection range precisely.
 * If head is omitted, the selection is collapsed at anchor.
 */
export async function setSelection(page: Page, anchor: number, head?: number): Promise<void> {
  await page.evaluate(
    (opts: { anchor: number; head?: number }) => {
      const adapter = (window as any).__editor as EditorAdapterLike | undefined
      if (adapter?.setSelection) {
        adapter.setSelection({ anchor: opts.anchor, head: opts.head ?? opts.anchor })
        return
      }
      const view = (window as any).__cmView
      if (view) {
        view.dispatch({ selection: { anchor: opts.anchor, head: opts.head ?? opts.anchor } })
      }
    },
    { anchor, head }
  )
  await page.waitForTimeout(100)
}

/**
 * Get the current selection range from the editor adapter.
 */
export async function getSelectionRange(page: Page): Promise<{ from: number; to: number; empty: boolean }> {
  return page.evaluate(() => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.getSelection) {
      const { anchor, head } = adapter.getSelection()
      const from = Math.min(anchor, head)
      const to = Math.max(anchor, head)
      return { from, to, empty: from === to }
    }
    const view = (window as any).__cmView
    if (!view) return { from: -1, to: -1, empty: true }
    const range = view.state.selection.main
    return { from: range.from, to: range.to, empty: range.empty }
  })
}

/**
 * Get the screen coordinates for a document position.
 * Returns the center point of the character at the given position.
 */
export async function getCoordsAtPos(page: Page, pos: number): Promise<{ x: number; y: number } | null> {
  const box = await page.evaluate((p) => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.coordsAtPos) {
      const rect = adapter.coordsAtPos(p)
      if (!rect) return null
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    }

    const view = (window as any).__cmView
    if (!view) return null

    const rect = view.coordsAtPos?.(p)
    if (!rect) return null

    const width = rect.right - rect.left
    const height = rect.bottom - rect.top
    return { left: rect.left, top: rect.top, width, height }
  }, pos)
  if (!box) return null
  const x = Math.round(box.left + box.width / 2)
  const y = Math.round(box.top + box.height / 2)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}


/**
 * Perform a real mouse drag selection from one document position to another.
 */
export async function dragSelect(page: Page, from: number, to: number): Promise<void> {
  const start = await getCoordsAtPos(page, from)
  const end = await getCoordsAtPos(page, to)
  if (!start || !end) {
    throw new Error(`Cannot resolve coordinates for drag selection from ${from} to ${to}`)
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}

/**
 * Toggle raw mode on/off via the window.__setRawMode API.
 */
export async function toggleRawMode(page: Page, on: boolean): Promise<void> {
  await page.evaluate((v: boolean) => {
    ;(window as any).__setRawMode?.(v)
  }, on)
  await page.waitForTimeout(200)
}

/**
 * Scroll the editor so the given document position is visible,
 * and place the cursor there.
 */
export async function scrollToPosition(page: Page, pos: number): Promise<void> {
  await page.evaluate((p) => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.setSelection) {
      adapter.setSelection({ anchor: p }, { scroll: true })
      return
    }

    const view = (window as any).__cmView
    if (!view) return
    const EditorView = view.constructor
    view.dispatch({
      selection: { anchor: p },
      effects: EditorView.scrollIntoView?.(p, { y: 'center' }),
    })
  }, pos)
  await page.waitForTimeout(300)
}

export async function dispatchEditorKeydown(
  page: import('@playwright/test').Page,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}
): Promise<void> {
  // Focus through the adapter when available, otherwise fall back to the raw view.
  await page.evaluate(() => {
    const adapter = (window as any).__editor as EditorAdapterLike | undefined
    if (adapter?.focus) {
      adapter.focus()
      return
    }
    const view = (window as any).__cmView
    if (view?.focus) {
      view.focus()
    }
  })
  await page.waitForTimeout(50)

  const parts: string[] = []
  if (modifiers.ctrl) parts.push('Control')
  if (modifiers.shift) parts.push('Shift')
  if (modifiers.meta) parts.push('Meta')
  parts.push(key)
  await page.keyboard.press(parts.join('+'))
}
