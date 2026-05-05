import { test, expect } from '@playwright/test'
import { waitForAppReady } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, TEST_WORKSPACE, getTreeItem } from '../helpers/filetree'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
} as Record<string, string>

function initGit(cwd: string) {
  cp.execSync('git init', { cwd })
  cp.execSync('git add -A', { cwd })
  cp.execSync('git commit -m "initial"', { cwd, env: GIT_ENV })
}

function removeGit(cwd: string) {
  const gitDir = path.join(cwd, '.git')
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true })
  }
}

function getGitLog(cwd: string): string {
  return cp.execSync('git log --oneline -1', { cwd }).toString().trim()
}

test.describe('Git Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
    // Reset workspace to clean state (no .git)
    removeGit(TEST_WORKSPACE)
  })

  test('prompts to init git when workspace is not a git repository', async ({ page }) => {
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Wait for the confirm dialog from the rootPath watcher
    const dialog = page.locator('.confirm-dialog-overlay')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.confirm-dialog-header')).toHaveText('初始化 Git 仓库')
    await expect(page.locator('.confirm-dialog-body')).toHaveText(
      '此文件夹还不是一个 git 仓库，是否要初始化？'
    )

    // Click Initialize
    await page.locator('.btn-confirm').click()
    await page.waitForTimeout(500)

    // Dialog should close
    await expect(dialog).not.toBeVisible()

    // Verify .git directory was created
    expect(fs.existsSync(path.join(TEST_WORKSPACE, '.git'))).toBe(true)
  })

  test('shows sync menu with pull, commit, push options', async ({ page }) => {
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Click the sync button (GitBranch icon)
    await page.locator('.floating-btn[title="Git Sync"]').click()

    const menu = page.locator('.sync-menu')
    await expect(menu).toBeVisible()

    const items = menu.locator('.sync-menu-item')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toContainText('拉取')
    await expect(items.nth(1)).toContainText('提交')
    await expect(items.nth(2)).toContainText('推送')

    // Close menu by clicking overlay
    await page.locator('.sync-menu-overlay').click({ position: { x: 0, y: 0 } })
    await expect(menu).not.toBeVisible()
  })

  test('commits changes with a custom message', async ({ page }) => {
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open file and make changes
    await getTreeItem(page, 'readme.md').click()
    await page.waitForTimeout(500)
    await page.locator('.cm-content').click()
    await page.keyboard.type('content for git commit test', { delay: 20 })
    await page.waitForTimeout(300)

    // Open sync menu and click Commit
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.locator('.sync-menu-item').filter({ hasText: '提交' }).click()
    await page.waitForTimeout(300)

    // Enter commit message
    const input = page.locator('.sync-commit-input')
    await expect(input).toBeVisible()
    await input.fill('test: e2e commit')
    await input.press('Enter')
    await page.waitForTimeout(1000)

    // Verify the commit landed via git log
    const log = getGitLog(TEST_WORKSPACE)
    expect(log).toContain('test: e2e commit')
  })

  test('cancels git init when declining the prompt', async ({ page }) => {
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Wait for confirm dialog
    const dialog = page.locator('.confirm-dialog-overlay')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Click cancel
    await page.locator('.btn-cancel').click()
    await page.waitForTimeout(500)

    // Dialog should close
    await expect(dialog).not.toBeVisible()

    // Verify .git was NOT created
    expect(fs.existsSync(path.join(TEST_WORKSPACE, '.git'))).toBe(false)
  })

  test('toggles sync menu by clicking the sync button', async ({ page }) => {
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    const btn = page.locator('.floating-btn[title="Git Sync"]')
    const menu = page.locator('.sync-menu')

    // First click — menu opens
    await btn.click()
    await expect(menu).toBeVisible()

    // Second click — menu closes (toggleSyncMenu sets showSyncMenu = false)
    await btn.click()
    await expect(menu).not.toBeVisible()
  })
})
