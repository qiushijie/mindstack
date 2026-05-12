import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { getContent, setContent } from '../helpers/editor'

test.describe('AI Edit Diff View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    // Dismiss the git-init confirm dialog that appears when a workspace loads
    const dialog = page.locator('.confirm-dialog-overlay')
    try {
      await dialog.waitFor({ state: 'visible', timeout: 3000 })
      await page.locator('.btn-cancel').click()
      await dialog.waitFor({ state: 'hidden', timeout: 3000 })
    } catch {
      // Dialog did not appear, that's fine
    }
  })

  test('should render diff view with hunks', async ({ page }) => {
    const original = 'line 1\nline 2\nline 3'
    const modified = 'line 1\nmodified line 2\nline 3\nnew line'

    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })

    await expect(page.locator('.diff-view')).toBeVisible()

    // Verify diff tab is active
    const diffTab = page.locator('.tab-item').filter({ hasText: 'Diff' })
    await expect(diffTab).toHaveClass(/active/)

    // Verify hunks are rendered
    const removedLines = page.locator('.diff-line.removed')
    const addedLines = page.locator('.diff-line.added')
    await expect(removedLines).toHaveCount(1)
    await expect(addedLines).toHaveCount(2)
    await expect(removedLines.first()).toContainText('line 2')
    await expect(addedLines.nth(0)).toContainText('modified line 2')
    await expect(addedLines.nth(1)).toContainText('new line')
  })

  test('should apply changes and close diff view on Accept All', async ({ page }) => {
    const original = 'hello world\nfoo bar\nbaz qux'
    const modified = 'hello world\nmodified bar\nbaz qux\nnew line'

    // Set initial editor content
    await setContent(page, original)
    await expect.poll(() => getContent(page)).toBe(original)

    // Open diff view
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })
    await expect(page.locator('.diff-view')).toBeVisible()

    // Click Accept All
    await page.click('.action-btn.accept-all')

    // Diff view should close and editor should be visible
    await expect(page.locator('.diff-view')).not.toBeVisible()
    await expect(page.locator('.editor')).toBeVisible()

    // Editor content should be the modified version
    await expect.poll(() => getContent(page)).toBe(modified)
  })

  test('should discard changes and close diff view on Reject All', async ({ page }) => {
    const original = 'hello world\nfoo bar\nbaz qux'
    const modified = 'hello world\nmodified bar\nbaz qux\nnew line'

    // Set initial editor content
    await setContent(page, original)
    await expect.poll(() => getContent(page)).toBe(original)

    // Open diff view
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })
    await expect(page.locator('.diff-view')).toBeVisible()

    // Click Reject All
    await page.click('.action-btn.reject-all')

    // Diff view should close and editor should be visible
    await expect(page.locator('.diff-view')).not.toBeVisible()
    await expect(page.locator('.editor')).toBeVisible()

    // Editor content should remain the original
    await expect.poll(() => getContent(page)).toBe(original)
  })

  test('should overwrite previous diff when opening a new one', async ({ page }) => {
    const original = 'line 1\nline 2\nline 3'
    const modified1 = 'line 1\nmodified line 2\nline 3'
    const modified2 = 'line 1\nline 2\nmodified line 3'

    // Open first diff
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified: modified1 })
    await expect(page.locator('.diff-view')).toBeVisible()
    await expect(page.locator('.diff-line.removed')).toContainText('line 2')
    await expect(page.locator('.diff-line.added')).toContainText('modified line 2')

    // Open second diff without closing the first
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified: modified2 })

    // Diff view should still be visible with new content
    await expect(page.locator('.diff-view')).toBeVisible()
    await expect(page.locator('.diff-line.removed')).toContainText('line 3')
    await expect(page.locator('.diff-line.added')).toContainText('modified line 3')

    // Previous diff content should not be present
    await expect(page.locator('.diff-line.added')).not.toContainText('modified line 2')
  })

  test('should block AI chat input while diff is pending', async ({ page }) => {
    const original = 'old content'
    const modified = 'new content'

    // Set initial editor content and open AI chat panel
    await setContent(page, original)
    await page.locator('.floating-btn[title="AI Assistant"]').first().click({ force: true })
    await expect(page.locator('.ai-chat-panel')).toBeVisible()

    // Open diff view
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })
    await expect(page.locator('.diff-view')).toBeVisible()

    // Input area should show pending warning and be disabled
    await expect(page.locator('.diff-pending-bar')).toBeVisible()
    const textarea = page.locator('.ai-chat-panel .chat-input')
    const sendBtn = page.locator('.ai-chat-panel .send-btn')
    await expect(textarea).toBeDisabled()
    await expect(sendBtn).toBeDisabled()

    // Click Accept All to resolve the diff
    await page.click('.action-btn.accept-all')
    await expect(page.locator('.diff-view')).not.toBeVisible()

    // Input area should be enabled again
    await expect(page.locator('.diff-pending-bar')).not.toBeVisible()
    await expect(textarea).toBeEnabled()
    await expect(sendBtn).toBeEnabled()
  })

  test('should close diff view when clicking tab close', async ({ page }) => {
    const original = 'old text'
    const modified = 'new text'

    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })
    await expect(page.locator('.diff-view')).toBeVisible()

    // Find and click the diff tab close button
    const diffTab = page.locator('.tab-item').filter({ hasText: 'Diff' })
    await diffTab.locator('.tab-close').click()

    await expect(page.locator('.diff-view')).not.toBeVisible()
  })

  test('should auto-close and apply when all hunks handled individually', async ({ page }) => {
    // Need >3 context lines between changes to create separate hunks
    const original = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8'
    const modified = 'line 1\nmodified line 2\nline 3\nline 4\nline 5\nline 6\nmodified line 7\nline 8'

    // Set initial editor content
    await setContent(page, original)
    await expect.poll(() => getContent(page)).toBe(original)

    // Open diff view (2 hunks: line 2 changed, line 7 changed)
    await page.evaluate((args) => {
      (window as any).__testOpenDiffView?.(args.original, args.modified, 'test.md')
    }, { original, modified })
    await expect(page.locator('.diff-view')).toBeVisible()

    // Verify there are 2 hunks with pending Y buttons
    const yButtons = page.locator('.hunk-btn.y')
    await expect(yButtons).toHaveCount(2)

    // Accept first hunk
    await yButtons.nth(0).click()
    await expect(page.locator('.diff-view')).toBeVisible()

    // Reject second hunk (click N)
    const nButtons = page.locator('.hunk-btn.n')
    await expect(nButtons).toHaveCount(1)
    await nButtons.nth(0).click()

    // All hunks handled: diff view should auto-close and editor should be visible
    await expect(page.locator('.diff-view')).not.toBeVisible()
    await expect(page.locator('.editor')).toBeVisible()

    // Applied content: first hunk accepted (modified line 2), second rejected (line 7 unchanged)
    const expected = 'line 1\nmodified line 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8'
    await expect.poll(() => getContent(page)).toBe(expected)
  })
})
