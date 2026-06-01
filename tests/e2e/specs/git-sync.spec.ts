import { test, expect } from '@playwright/test'
import { waitForAppReady, navigateTo } from '../helpers/app'
import { openTestWorkspace, waitForTreeReady, TEST_WORKSPACE, getTreeItem } from '../helpers/filetree'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

const REMOTE_DIR = path.resolve(__dirname, '../fixtures/remote.git')

function initGitWithRemote(cwd: string) {
  cp.execSync('git init', { cwd })
  cp.execSync('git add -A', { cwd })
  cp.execSync('git commit -m "initial"', { cwd, env: GIT_ENV })
  cp.execSync(`git remote add origin "${REMOTE_DIR}"`, { cwd })
  const branch = cp.execSync('git rev-parse --abbrev-ref HEAD', { cwd }).toString().trim()
  cp.execSync(`git push -u origin ${branch}`, { cwd, env: GIT_ENV })
}

const CONFIG_PATH = path.join(os.homedir(), 'Library/Application Support/mindstack/config.json')

// Skipped: these tests require Wails Go backend bindings
// (GitStatus, GitCommitFiles, GitInit, GitPull, GitPush, etc.) which are
// unavailable when running against the Vite dev server. They must be run
// against the built Wails binary instead.
test.describe.skip('Git Sync', () => {
  let configBackup: string | null = null

  test.beforeAll(() => {
    if (fs.existsSync(CONFIG_PATH)) {
      configBackup = fs.readFileSync(CONFIG_PATH, 'utf-8')
    }
  })

  test.afterAll(() => {
    if (configBackup !== null) {
      try {
        fs.writeFileSync(CONFIG_PATH, configBackup)
      } catch {
        // best effort restore
      }
    }
  })

  test.beforeEach(async ({ page }) => {
    // Clear lastFolderPath from config so restoreSession is a no-op.
    // This prevents unwanted git init dialog on page load.
    if (fs.existsSync(CONFIG_PATH)) {
      try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
        const cfg = JSON.parse(raw)
        delete cfg.lastFolderPath
        delete cfg.lastFilePath
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg))
      } catch {
        fs.writeFileSync(CONFIG_PATH, '{}')
      }
    }

    await page.goto('/')
    await waitForAppReady(page)
    // Reset workspace to clean state (no .git)
    removeGit(TEST_WORKSPACE)
    // Reset bare remote so each test starts with a clean remote
    fs.rmSync(REMOTE_DIR, { recursive: true, force: true })
    cp.execSync(`git init --bare "${REMOTE_DIR}"`)
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
    // Save to disk so GitCommit can stage the changes
    await page.keyboard.press('Meta+s')
    await page.waitForTimeout(500)

    // Open sync menu and click Commit
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.locator('.sync-menu-item').filter({ hasText: '提交' }).click()
    await page.waitForTimeout(300)

    // Commit dialog opens — type message and confirm
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await page.locator('.commit-msg-textarea').fill('test: e2e commit')
    await page.locator('.commit-btn-primary').click()
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

    // Click the overlay to close (button is covered by overlay when menu is open)
    await page.locator('.sync-menu-overlay').click({ position: { x: 0, y: 0 } })
    await expect(menu).not.toBeVisible()
  })

  test('pushes committed changes to remote', async ({ page }) => {
    initGitWithRemote(TEST_WORKSPACE)

    // Make a local commit to push
    cp.execSync('git commit --allow-empty -m "test: push e2e"', { cwd: TEST_WORKSPACE, env: GIT_ENV })

    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open sync menu and click push
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '推送' }).click()

    // Wait for push success status
    await expect(page.locator('.sync-status')).toContainText('推送完成', { timeout: 15000 })

    // Verify the commit reached the bare remote
    const remoteLog = cp.execSync(`git -C "${REMOTE_DIR}" log --oneline -1`, { env: GIT_ENV }).toString().trim()
    expect(remoteLog).toContain('test: push e2e')
  })

  test('pulls remote changes', async ({ page }) => {
    initGitWithRemote(TEST_WORKSPACE)

    // Simulate a remote change: clone bare repo, commit, push back
    const cloneDir = path.resolve(TEST_WORKSPACE, '..', '.pull-test-clone')
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execSync(`git clone "${REMOTE_DIR}" "${cloneDir}"`, { env: GIT_ENV })
      cp.execSync('git commit --allow-empty -m "feat: remote change"', { cwd: cloneDir, env: GIT_ENV })
      cp.execSync('git push', { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open sync menu and click pull
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '拉取' }).click()

    // Wait for pull success status
    await expect(page.locator('.sync-status')).toContainText('拉取完成', { timeout: 15000 })

    // Verify the workspace now has the remote commit
    const log = cp.execSync('git log --oneline -1', { cwd: TEST_WORKSPACE }).toString().trim()
    expect(log).toContain('feat: remote change')
  })

  test('shows error when pushing without remote', async ({ page }) => {
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '推送' }).click()

    await expect(page.locator('.sync-status')).toContainText('Git 错误', { timeout: 10000 })
  })

  test('shows error when pulling without remote', async ({ page }) => {
    initGit(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '拉取' }).click()

    await expect(page.locator('.sync-status')).toContainText('Git 错误', { timeout: 10000 })
  })

  test('commits changes via the commit dialog', async ({ page }) => {
    initGitWithRemote(TEST_WORKSPACE)
    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Enable auto-commit in settings
    await navigateTo(page, 'settings')
    await page.waitForSelector('.settings-section', { timeout: 5000 })

    const autoCommitToggle = page.locator('.setting-row').filter({ hasText: '自动提交' }).locator('.toggle')
    const isOn = await autoCommitToggle.evaluate(el => el.classList.contains('on'))
    if (!isOn) {
      await autoCommitToggle.click()
      await page.waitForTimeout(500)
    }

    // Navigate back to editor
    await navigateTo(page, 'editor')
    await page.waitForSelector('.cm-editor', { timeout: 5000 })

    // Write a change directly to disk (auto-save delay is 5s by default, so we
    // bypass the editor to avoid waiting for the timer)
    fs.appendFileSync(path.join(TEST_WORKSPACE, 'readme.md'), '\n\nauto-commit test content\n')

    // Open sync menu and click commit — CommitDialog opens (submit always opens it)
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '提交' }).click()

    // Fill in commit message in the dialog and confirm
    await expect(page.locator('.commit-dialog-overlay')).toBeVisible()
    await page.locator('.commit-msg-textarea').fill('test: auto-commit e2e')
    await page.locator('.commit-btn-primary').click()

    // Wait for commit to complete and dialog to close
    await expect(page.locator('.commit-dialog-overlay')).not.toBeVisible({ timeout: 15000 })

    // Verify a new commit was created (not the "initial" one)
    const log = cp.execSync('git log --oneline -1', { cwd: TEST_WORKSPACE }).toString().trim()
    expect(log).toContain('auto-commit')

    // Verify the commit only exists locally, not pushed to remote
    const remoteLog = cp.execSync(`git -C "${REMOTE_DIR}" log --oneline -1`, { env: GIT_ENV }).toString().trim()
    expect(remoteLog).toContain('initial')
  })

  test('shows error when pull fails due to conflicting local changes', async ({ page }) => {
    initGitWithRemote(TEST_WORKSPACE)

    // Make a local change and commit (diverges from remote)
    fs.appendFileSync(path.join(TEST_WORKSPACE, 'readme.md'), '\n\nlocal conflict\n')
    cp.execSync('git add -A', { cwd: TEST_WORKSPACE })
    cp.execSync('git commit -m "local change"', { cwd: TEST_WORKSPACE, env: GIT_ENV })

    // Make a conflicting change on the remote via clone
    const cloneDir = path.resolve(TEST_WORKSPACE, '..', '.conflict-pull-clone')
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execSync(`git clone "${REMOTE_DIR}" "${cloneDir}"`, { env: GIT_ENV })
      fs.appendFileSync(path.join(cloneDir, 'readme.md'), '\n\nremote conflict\n')
      cp.execSync('git add -A', { cwd: cloneDir })
      cp.execSync('git commit -m "remote change"', { cwd: cloneDir, env: GIT_ENV })
      cp.execSync('git push', { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open sync menu and click pull — --ff-only will fail
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '拉取' }).click()

    await expect(page.locator('.sync-status')).toContainText('Git 错误', { timeout: 15000 })
  })

  test('shows error when push is rejected due to diverged remote', async ({ page }) => {
    initGitWithRemote(TEST_WORKSPACE)

    // First make a remote change (via clone)
    const cloneDir = path.resolve(TEST_WORKSPACE, '..', '.conflict-push-clone')
    try {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
      cp.execSync(`git clone "${REMOTE_DIR}" "${cloneDir}"`, { env: GIT_ENV })
      fs.appendFileSync(path.join(cloneDir, 'readme.md'), '\n\nremote ahead\n')
      cp.execSync('git add -A', { cwd: cloneDir })
      cp.execSync('git commit -m "remote ahead"', { cwd: cloneDir, env: GIT_ENV })
      cp.execSync('git push', { cwd: cloneDir, env: GIT_ENV })
    } finally {
      if (fs.existsSync(cloneDir)) fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    // Now make a local commit without pulling first
    fs.appendFileSync(path.join(TEST_WORKSPACE, 'readme.md'), '\n\nlocal behind\n')
    cp.execSync('git add -A', { cwd: TEST_WORKSPACE })
    cp.execSync('git commit -m "local behind"', { cwd: TEST_WORKSPACE, env: GIT_ENV })

    await openTestWorkspace(page)
    await waitForTreeReady(page)

    // Open sync menu and click push — will be rejected (non-fast-forward)
    await page.locator('.floating-btn[title="Git Sync"]').click()
    await page.waitForTimeout(300)
    await page.locator('.sync-menu-item').filter({ hasText: '推送' }).click()

    await expect(page.locator('.sync-status')).toContainText('Git 错误', { timeout: 15000 })
  })
})
