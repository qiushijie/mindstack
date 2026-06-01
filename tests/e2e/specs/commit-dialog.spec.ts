import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'

test.describe('Commit Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    // Mock Go bindings for git status
    await page.evaluate(() => {
      ;(window as any).go = {
        main: {
          App: {
            GitStatus: () => Promise.resolve(JSON.stringify({
              files: [
                { path: 'docs/readme.md', staged: 'M', unstaged: '' },
                { path: 'src/main.go', staged: '', unstaged: 'M' },
                { path: 'tests/new.spec.ts', staged: 'A', unstaged: '' },
              ]
            })),
            GitCommitFiles: () => Promise.resolve(JSON.stringify({ ok: true })),
          }
        }
      }
    })
  })

  test('should open commit dialog', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await expect(page.locator('.commit-dialog')).toBeVisible()
  })

  test('should show file list', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(500)

    const fileRows = page.locator('.commit-file-row')
    expect(await fileRows.count()).toBeGreaterThan(0)
  })

  test('should show commit message textarea', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    const textarea = page.locator('.commit-msg-textarea')
    await expect(textarea).toBeVisible()
  })

  test('should disable commit button when message is empty', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    const commitBtn = page.locator('.commit-btn-primary')
    await expect(commitBtn).toBeDisabled()
  })

  test('should enable commit button after typing message', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    const textarea = page.locator('.commit-msg-textarea')
    await textarea.fill('Test commit message')
    await page.waitForTimeout(100)

    const commitBtn = page.locator('.commit-btn-primary')
    await expect(commitBtn).toBeEnabled()
  })

  test('should close dialog on cancel click', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()

    await page.locator('.commit-btn-cancel').click()
    await page.waitForTimeout(200)

    await expect(page.locator('.commit-dialog-overlay')).toBeHidden()
  })

  test('should close dialog on overlay click', async ({ page }) => {
    await page.evaluate(() => (window as any).__testShowCommitDialog())
    await page.waitForTimeout(300)

    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()

    await page.locator('.commit-dialog-overlay').click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(200)

    await expect(page.locator('.commit-dialog-overlay')).toBeHidden()
  })
})
