import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, setContent, clearEditor, focusEditor } from '../helpers/editor'

async function hoverGutter(page: import('@playwright/test').Page) {
  const gutter = page.locator('.cm-gutters')
  await gutter.hover()
  await page.waitForTimeout(300)
}

async function dragHandleToLine(
  page: import('@playwright/test').Page,
  handleIndex: number,
  targetLineIndex: number,
  dropPosition: 'top' | 'bottom' = 'bottom'
) {
  const handles = page.locator('.cm-block-drag')
  await expect(handles.nth(handleIndex)).toBeVisible({ timeout: 5000 })

  const handle = handles.nth(handleIndex)
  const handleBox = await handle.boundingBox()

  const lines = page.locator('.cm-line')
  const targetLine = lines.nth(targetLineIndex)
  const targetBox = await targetLine.boundingBox()

  if (!handleBox || !targetBox) return false

  const dropY = dropPosition === 'top'
    ? targetBox.y + targetBox.height * 0.25
    : targetBox.y + targetBox.height * 0.75

  // Drop at left edge for 'top' to ensure posAtCoords returns line-start,
  // which is always < lineMid, so newTarget = target.lineFrom
  const dropX = dropPosition === 'top'
    ? targetBox.x + 2
    : targetBox.x + targetBox.width / 2

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(100)

  await page.mouse.move(
    dropX,
    dropY,
    { steps: 10 }
  )
  await page.waitForTimeout(100)

  await page.mouse.up()
  await page.waitForTimeout(500)
  return true
}

test.describe('Editor Drag Sort', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await clearEditor(page)
  })

  test('should show drag handles in gutter', async ({ page }) => {
    await setContent(page, '# First\n\nParagraph\n\n# Second')
    await focusEditor(page)

    await hoverGutter(page)

    const handles = page.locator('.cm-block-drag')
    await expect(handles.first()).toBeVisible({ timeout: 5000 })
    const count = await handles.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('should reorder blocks by dragging', async ({ page }) => {
    await setContent(page, '# First\n\n# Second')
    await focusEditor(page)

    await hoverGutter(page)

    const didDrag = await dragHandleToLine(page, 0, 2, 'bottom')
    if (!didDrag) return

    const content = await getContent(page)
    expect(content.indexOf('# Second')).toBeLessThan(content.indexOf('# First'))
  })

  test('should drag second block when blocks are adjacent without blank line', async ({ page }) => {
    // Regression test: when h3 and code block have no blank line between,
    // clicking code block's drag handle should move the code block, not h3
    await setContent(page, '### h3\n```\ncode\n```')
    await focusEditor(page)

    await hoverGutter(page)

    const handles = page.locator('.cm-block-drag')
    await expect(handles.nth(1)).toBeVisible({ timeout: 5000 })

    // Drag the second handle (code block) and drop at top of first block
    // This should move code block above h3
    const didDrag = await dragHandleToLine(page, 1, 0, 'top')
    if (!didDrag) return

    const content = await getContent(page)
    // After dragging code block above h3, code block should come first
    const codeIndex = content.indexOf('```')
    const h3Index = content.indexOf('###')
    expect(codeIndex).toBeLessThan(h3Index)
  })

  test('should drag multi-line code block correctly', async ({ page }) => {
    await setContent(page, '# Heading\n```\nline1\nline2\nline3\n```')
    await focusEditor(page)

    await hoverGutter(page)

    // The code block is the second block (index 1)
    // Drag it to above the heading (drop at line 0 top)
    const didDrag = await dragHandleToLine(page, 1, 0, 'top')
    if (!didDrag) return

    const content = await getContent(page)
    expect(content.indexOf('```')).toBeLessThan(content.indexOf('# Heading'))
  })

  test('should drag list block adjacent to quote block', async ({ page }) => {
    await setContent(page, '- item1\n> quote')
    await focusEditor(page)

    await hoverGutter(page)

    // Drag quote block (second block) above list
    const didDrag = await dragHandleToLine(page, 1, 0, 'top')
    if (!didDrag) return

    const content = await getContent(page)
    expect(content.indexOf('>')).toBeLessThan(content.indexOf('-'))
  })

  test('should drag paragraph block adjacent to code block', async ({ page }) => {
    await setContent(page, 'paragraph\n```\ncode\n```')
    await focusEditor(page)

    await hoverGutter(page)

    // Drag code block (second block) above paragraph
    const didDrag = await dragHandleToLine(page, 1, 0, 'top')
    if (!didDrag) return

    const content = await getContent(page)
    expect(content.indexOf('```')).toBeLessThan(content.indexOf('paragraph'))
  })

  test('should drag heading block adjacent to list block', async ({ page }) => {
    await setContent(page, '## Heading\n- item')
    await focusEditor(page)

    await hoverGutter(page)

    // Drag list block (second block) above heading
    const didDrag = await dragHandleToLine(page, 1, 0, 'top')
    if (!didDrag) return

    const content = await getContent(page)
    expect(content.indexOf('-')).toBeLessThan(content.indexOf('##'))
  })
})
