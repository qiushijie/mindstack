import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import {
  getContent,
  setContent,
  clearEditor,
  focusEditor,
  dispatchEditorKeydown,
} from '../helpers/editor'

async function selectWordByDoubleClick(page: import('@playwright/test').Page): Promise<void> {
  const cmContent = page.locator('.cm-content')
  const box = await cmContent.boundingBox()
  if (box) {
    await page.mouse.dblclick(box.x + 30, box.y + 25)
    await page.waitForTimeout(300)
  }
}

async function clickOnLine(page: import('@playwright/test').Page): Promise<void> {
  const cmContent = page.locator('.cm-content')
  const box = await cmContent.boundingBox()
  if (box) {
    await page.mouse.click(box.x + 30, box.y + 25)
    await page.waitForTimeout(200)
  }
}

test.describe('Inline Formatting Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('Cmd+B wraps selection in bold', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await page.keyboard.press('Control+b')

    const content = await getContent(page)
    expect(content).toBe('**Hello** World')
  })

  // Chromium intercepts Ctrl+I as built-in italic command, blocking CodeMirror
  test.skip('Cmd+I wraps selection in italic', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await dispatchEditorKeydown(page, 'i', { ctrl: true })

    const content = await getContent(page)
    expect(content).toBe('*Hello* World')
  })

  test('Cmd+Shift+S wraps selection in strikethrough', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await page.keyboard.press('Control+Shift+s')

    const content = await getContent(page)
    expect(content).toBe('~~Hello~~ World')
  })

  test('Cmd+` wraps selection in code', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await page.keyboard.press('Control+`')

    const content = await getContent(page)
    expect(content).toBe('`Hello` World')
  })

  test('Cmd+K inserts link', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await selectWordByDoubleClick(page)
    await page.keyboard.press('Control+k')

    const content = await getContent(page)
    expect(content).toContain('[Hello](')
  })
})

test.describe('Block Type Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('Cmd+1 converts to H1', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+1')

    const content = await getContent(page)
    expect(content).toBe('# Hello World')
  })

  test('Cmd+2 converts to H2', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+2')

    const content = await getContent(page)
    expect(content).toBe('## Hello World')
  })

  test('Cmd+3 converts to H3', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+3')

    const content = await getContent(page)
    expect(content).toBe('### Hello World')
  })

  test('Cmd+4 converts to H4', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+4')

    const content = await getContent(page)
    expect(content).toBe('#### Hello World')
  })

  test('Cmd+0 removes heading', async ({ page }) => {
    await setContent(page, '# Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+0')

    const content = await getContent(page)
    expect(content).toBe('Hello World')
  })

  test('Cmd+Shift+8 converts to bullet list', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+Shift+8')

    const content = await getContent(page)
    expect(content).toBe('- Hello World')
  })

  test('Cmd+Shift+9 converts to numbered list', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+Shift+9')

    const content = await getContent(page)
    expect(content).toBe('1. Hello World')
  })

  test('Cmd+Shift+. converts to blockquote', async ({ page }) => {
    await setContent(page, 'Hello World')
    await focusEditor(page)
    await clickOnLine(page)
    await page.keyboard.press('Control+Shift+.')

    const content = await getContent(page)
    expect(content).toBe('> Hello World')
  })
})

test.describe('Misc Shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  // Playwright cannot reliably send Mod+Enter on macOS
  test.skip('Cmd+Enter toggles checkbox from unchecked to checked', async ({ page }) => {
    await setContent(page, '- [ ] task')
    await focusEditor(page)
    await clickOnLine(page)
    await dispatchEditorKeydown(page, 'Enter', { ctrl: true })

    const content = await getContent(page)
    expect(content).toBe('- [x] task')
  })

  test.skip('Cmd+Enter toggles checkbox from checked to unchecked', async ({ page }) => {
    await setContent(page, '- [x] task')
    await focusEditor(page)
    await clickOnLine(page)
    await dispatchEditorKeydown(page, 'Enter', { ctrl: true })

    const content = await getContent(page)
    expect(content).toBe('- [ ] task')
  })
})
