import * as cp from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const fixturesDir = path.resolve(__dirname, 'fixtures')
const baselineDir = path.join(fixturesDir, '_baseline')
const workspaceDir = path.join(fixturesDir, 'workspace')
const remoteDir = path.join(fixturesDir, 'remote.git')

export default function globalSetup() {
  // Reset workspace from baseline
  fs.rmSync(workspaceDir, { recursive: true, force: true })
  fs.cpSync(baselineDir, workspaceDir, { recursive: true })

  // Create bare remote repo for push/pull E2E tests
  fs.rmSync(remoteDir, { recursive: true, force: true })
  cp.execSync(`git init --bare "${remoteDir}"`)
}
