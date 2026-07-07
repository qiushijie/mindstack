import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export function getConfigPath(): string {
  if (!process.env.MINDSTACK_CONFIG_DIR) {
    throw new Error(
      'MINDSTACK_CONFIG_DIR is not set. Run E2E tests via `pnpm test` or export MINDSTACK_CONFIG_DIR to avoid polluting user config.',
    )
  }
  // Isolate config per Playwright worker to prevent cross-worker config races.
  const workerIndex = process.env.TEST_WORKER_INDEX || '0'
  const configDir = path.join(process.env.MINDSTACK_CONFIG_DIR, `worker-${workerIndex}`)
  fs.mkdirSync(configDir, { recursive: true })
  return path.join(configDir, 'config.json')
}

export function readConfig(): Record<string, any> {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    return {}
  }
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function writeConfig(cfg: Record<string, any>): void {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2))
}

export function clearSessionPaths(cfg: Record<string, any>): Record<string, any> {
  delete cfg.lastFolderPath
  delete cfg.lastFilePath
  return cfg
}

export function backupConfig(): string | null {
  const configPath = getConfigPath()
  if (!fs.existsSync(configPath)) {
    return null
  }
  const backupPath = path.join(os.tmpdir(), `mindstack-config-backup-${Date.now()}.json`)
  fs.copyFileSync(configPath, backupPath)
  return backupPath
}

export function restoreConfig(backupPath: string | null): void {
  if (!backupPath || !fs.existsSync(backupPath)) {
    return
  }
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.copyFileSync(backupPath, configPath)
  try {
    fs.unlinkSync(backupPath)
  } catch {
    // best effort cleanup
  }
}
