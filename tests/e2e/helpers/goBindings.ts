import { Page } from '@playwright/test'
import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

let bindingCounter = 0

export async function hasGoBinding(page: Page, name: string): Promise<boolean> {
  return page.evaluate((n) => !!(window as any).go?.main?.App?.[n], name)
}

export async function mockGoBinding(
  page: Page,
  name: string,
  handler: (...args: any[]) => any,
): Promise<void> {
  const channel = `__goBinding_${name}_${bindingCounter++}`
  await page.exposeFunction(channel, handler)
  await page.evaluate(
    ({ bindingName, channelName }) => {
      if (!(window as any).go) {
        ;(window as any).go = { main: { App: {} } }
      }
      ;(window as any).go.main.App[bindingName] = (...args: any[]) => {
        return (window as any)[channelName](...args)
      }
    },
    { bindingName: name, channelName: channel },
  )
}

export async function mockGoBindingsBatch(
  page: Page,
  bindings: Record<string, (...args: any[]) => any>,
): Promise<void> {
  for (const [name, handler] of Object.entries(bindings)) {
    await mockGoBinding(page, name, handler)
  }
}

interface MockGitOptions {
  workspace: string
  remoteDir?: string
  defaultBranch?: string
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
}

interface RunGitResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number
}

function runGit(args: string[], cwd: string): RunGitResult {
  try {
    const stdout = cp.execFileSync('git', args, { cwd, env: GIT_ENV }).toString().trim()
    return { ok: true, stdout, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return {
      ok: false,
      stdout: err.stdout?.toString()?.trim() || '',
      stderr: err.stderr?.toString()?.trim() || err.message || '',
      exitCode: err.status ?? 1,
    }
  }
}

function getCurrentBranch(cwd: string): string {
  const result = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return result.ok ? result.stdout : 'main'
}

export async function mockGitBindings(page: Page, opts: MockGitOptions): Promise<void> {
  const { workspace, remoteDir, defaultBranch = 'main' } = opts

  await mockGoBindingsBatch(page, {
    SetWorkspaceRoot: () => Promise.resolve(),

    GitCheckInit: async () => {
      const exists = fs.existsSync(path.join(workspace, '.git'))
      return exists
    },

    GitInit: async () => {
      const result = runGit(['init'], workspace)
      if (!result.ok) {
        return JSON.stringify({ error: result.stderr || 'git init failed' })
      }
      return JSON.stringify({ ok: true })
    },

    GitStatus: async () => {
      if (!fs.existsSync(path.join(workspace, '.git'))) {
        return JSON.stringify({ clean: true, files: [] })
      }
      const result = runGit(['status', '--porcelain=v1'], workspace)
      const files: { path: string; staged: string; unstaged: string }[] = []
      if (result.ok && result.stdout) {
        for (const line of result.stdout.split('\n')) {
          if (line.length < 4) continue
          const staged = line[0] === ' ' ? '' : line[0]
          const unstaged = line[1] === ' ' ? '' : line[1]
          const filePath = line.slice(3)
          files.push({ path: filePath, staged, unstaged })
        }
      }
      return JSON.stringify({ clean: files.length === 0, files })
    },

    GitCommitFiles: async (_message: string, _paths: string[]) => {
      const statusResult = runGit(['status', '--porcelain=v1'], workspace)
      if (!statusResult.ok || !statusResult.stdout) {
        return JSON.stringify({ error: statusResult.stderr || 'nothing to commit, working tree clean' })
      }
      const addResult = runGit(['add', '-A'], workspace)
      if (!addResult.ok) {
        return JSON.stringify({ error: addResult.stderr })
      }
      const commitResult = runGit(['commit', '-m', _message], workspace)
      if (!commitResult.ok) {
        return JSON.stringify({ error: commitResult.stderr })
      }
      return JSON.stringify({ ok: true })
    },

    GitAutoCommit: async () => {
      const statusResult = runGit(['status', '--porcelain=v1'], workspace)
      if (!statusResult.ok || !statusResult.stdout) {
        return JSON.stringify({ error: statusResult.stderr || 'nothing to commit, working tree clean' })
      }
      const addResult = runGit(['add', '-A'], workspace)
      if (!addResult.ok) {
        return JSON.stringify({ error: addResult.stderr })
      }
      const commitResult = runGit(['commit', '-m', 'auto-commit'], workspace)
      if (!commitResult.ok) {
        return JSON.stringify({ error: commitResult.stderr })
      }
      return JSON.stringify({ ok: true })
    },

    GitPull: async () => {
      if (!remoteDir || !fs.existsSync(remoteDir)) {
        return JSON.stringify({ error: 'no remote configured' })
      }
      const hasRemoteResult = runGit(['remote'], workspace)
      if (!hasRemoteResult.ok || !hasRemoteResult.stdout.includes('origin')) {
        return JSON.stringify({ error: 'no remote configured' })
      }
      const current = getCurrentBranch(workspace) || defaultBranch
      const result = runGit(['pull', '--ff-only', remoteDir, current], workspace)
      if (!result.ok) {
        return JSON.stringify({ error: result.stderr || result.stdout })
      }
      return JSON.stringify({ ok: true, message: result.stdout })
    },

    GitPush: async () => {
      if (!remoteDir || !fs.existsSync(remoteDir)) {
        return JSON.stringify({ error: 'no remote configured' })
      }
      const hasRemoteResult = runGit(['remote'], workspace)
      if (!hasRemoteResult.ok || !hasRemoteResult.stdout.includes('origin')) {
        return JSON.stringify({ error: 'no remote configured' })
      }
      const current = getCurrentBranch(workspace) || defaultBranch
      const result = runGit(['push', remoteDir, current], workspace)
      if (!result.ok) {
        return JSON.stringify({ error: result.stderr || result.stdout })
      }
      return JSON.stringify({ ok: true, message: result.stdout })
    },

    GitGenerateCommitMessage: async () => {
      return JSON.stringify({ message: 'test: generated message' })
    },
  })
}
