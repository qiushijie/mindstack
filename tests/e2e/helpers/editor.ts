import { Page, Locator } from '@playwright/test'

export async function getContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const view = (window as any).__cmView
    return view?.state?.doc?.toString() ?? ''
  })
}

export async function setContent(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
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

export async function dispatchEditorKeydown(
  page: import('@playwright/test').Page,
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}
): Promise<void> {
  await page.evaluate(({ key, ctrl, shift, meta }) => {
    const view = (window as any).__cmView
    if (view) {
      view.focus()
      const event = new KeyboardEvent('keydown', {
        key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        ctrlKey: ctrl ?? false,
        shiftKey: shift ?? false,
        metaKey: meta ?? false,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
      view.dom.dispatchEvent(event)
    }
  }, { key, ctrl: modifiers.ctrl, shift: modifiers.shift, meta: modifiers.meta })
}
