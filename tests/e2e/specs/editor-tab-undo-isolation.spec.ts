import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, getTreeItem } from '../helpers/filetree'
import { getContent, focusEditor, moveCursorToEnd } from '../helpers/editor'

async function openFileFromTree(page: import('@playwright/test').Page, name: string) {
  await getTreeItem(page, name).click()
  await page.waitForTimeout(800)
}

async function switchToTab(page: import('@playwright/test').Page, index: number) {
  const tabs = page.locator('.tab-item')
  await tabs.nth(index).click()
  await page.waitForTimeout(500)
}

// Append a unique marker at the end of the current document via real key
// events, so it lands on the editor's undo history.
async function appendMarker(page: import('@playwright/test').Page, marker: string) {
  await focusEditor(page)
  await moveCursorToEnd(page)
  await page.keyboard.type(marker, { delay: 20 })
  await page.waitForTimeout(300)
}

// Redo via either of the two common shortcuts CM6 binds for redo.
async function redoUntil(page: import('@playwright/test').Page, marker: string) {
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(200)
  if (!(await getContent(page)).includes(marker)) {
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(200)
  }
}

test.describe('Editor Tab Undo Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await page.evaluate(() => {
      ;(window as any).__resetFileTreeState?.()
      ;(window as any).__clearTabs?.()
    })
    await page.waitForTimeout(300)
    await openTestWorkspace(page)
    await waitForTreeReady(page)
  })

  test('should not revert to another file content when undoing across switches', async ({ page }) => {
    // Open readme.md and edit it so it has a non-empty undo history.
    await openFileFromTree(page, 'readme.md')
    await appendMarker(page, ' AAA')

    // Open code.md and edit it.
    await openFileFromTree(page, 'code.md')
    await appendMarker(page, ' BBB')

    const codeMarker = '## Code Examples'
    expect(await getContent(page)).toContain(codeMarker)
    expect(await getContent(page)).toContain(' BBB')

    // Undo several times on code.md. It must only revert code.md's edits and
    // must never fall back to readme.md's content.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).not.toContain(' BBB')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)

    // Still code.md's content, never readme.md's.
    const afterUndo = await getContent(page)
    expect(afterUndo).toContain(codeMarker)
    expect(afterUndo).not.toContain('![logo](url)')

    // Switch back to readme.md: its edit and undo history are intact.
    await switchToTab(page, 0)
    await focusEditor(page)
    expect(await getContent(page)).toContain(' AAA')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).not.toContain(' AAA')
  })

  test('should keep per-file redo independent across switches', async ({ page }) => {
    await openFileFromTree(page, 'readme.md')
    await appendMarker(page, ' 111')

    await openFileFromTree(page, 'code.md')
    await appendMarker(page, ' 222')

    // Undo then redo on code.md.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).not.toContain(' 222')

    await redoUntil(page, ' 222')
    expect(await getContent(page)).toContain(' 222')

    // Switch back to readme.md and exercise its own undo/redo independently.
    await switchToTab(page, 0)
    await focusEditor(page)
    expect(await getContent(page)).toContain(' 111')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(200)
    expect(await getContent(page)).not.toContain(' 111')

    await redoUntil(page, ' 111')
    expect(await getContent(page)).toContain(' 111')
  })
})
