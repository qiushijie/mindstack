import { test, expect } from '@playwright/test'
import { waitForAppReady, resetAppState } from '../helpers/app'
import { setContent, clearEditor, getContent } from '../helpers/editor'

test.describe('Todo Checkbox Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    await resetAppState(page)
    await clearEditor(page)
  })

  test('should render unchecked checkbox with cm-todo-check class', async ({ page }) => {
    await setContent(page, '- [ ] unchecked task')
    await page.waitForTimeout(200)

    const checkbox = page.locator('.cm-todo-check')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).not.toHaveClass(/done/)
  })

  test('should render checked checkbox with cm-todo-check done class', async ({ page }) => {
    await setContent(page, '- [x] checked task')
    await page.waitForTimeout(200)

    const checkbox = page.locator('.cm-todo-check')
    await expect(checkbox).toBeVisible()
    await expect(checkbox).toHaveClass(/done/)
  })

  test('should render checked checkbox with uppercase X', async ({ page }) => {
    await setContent(page, '- [X] checked task')
    await page.waitForTimeout(200)

    const checkbox = page.locator('.cm-todo-check')
    await expect(checkbox).toHaveClass(/done/)
  })

  test('should hide the task marker syntax from display', async ({ page }) => {
    await setContent(page, '- [ ] task text')
    await page.waitForTimeout(200)

    const listItem = page.locator('.cm-line.cm-list-item')
    const text = await listItem.textContent()
    expect(text?.trim()).not.toContain('[ ]')
  })

  test('should toggle checkbox on click', async ({ page }) => {
    await setContent(page, '- [ ] click me')
    await page.waitForTimeout(200)

    const checkbox = page.locator('.cm-todo-check')
    await expect(checkbox).not.toHaveClass(/done/)

    await checkbox.click()
    await page.waitForTimeout(300)

    // After click, checkbox should have 'done' class and source should contain [x]
    await expect(checkbox).toHaveClass(/done/)
    const content = await getContent(page)
    expect(content).toContain('[x]')
  })

  test('should toggle checkbox back on second click', async ({ page }) => {
    await setContent(page, '- [x] toggle back')
    await page.waitForTimeout(200)

    const checkbox = page.locator('.cm-todo-check')
    await expect(checkbox).toHaveClass(/done/)

    await checkbox.click()
    await page.waitForTimeout(300)

    await expect(checkbox).not.toHaveClass(/done/)
    const content = await getContent(page)
    expect(content).toContain('[ ]')
  })

  test('should render multiple todo items', async ({ page }) => {
    await setContent(page, '- [ ] task one\n- [x] task two\n- [ ] task three')
    await page.waitForTimeout(200)

    const checkboxes = page.locator('.cm-todo-check')
    expect(await checkboxes.count()).toBe(3)

    const doneCount = await page.locator('.cm-todo-check.done').count()
    expect(doneCount).toBe(1)
  })

  test('should render todo inside list item line', async ({ page }) => {
    await setContent(page, '- [ ] task with text')
    await page.waitForTimeout(200)

    // Should have both list-item class and checkbox widget
    await expect(page.locator('.cm-line.cm-list-item')).toBeVisible()
    await expect(page.locator('.cm-todo-check')).toBeVisible()
  })
})
