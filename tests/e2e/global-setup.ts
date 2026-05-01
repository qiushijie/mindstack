import * as fs from 'fs'
import * as path from 'path'

const fixturesDir = path.resolve(__dirname, 'fixtures')
const baselineDir = path.join(fixturesDir, '_baseline')
const workspaceDir = path.join(fixturesDir, 'workspace')

export default function globalSetup() {
  fs.rmSync(workspaceDir, { recursive: true, force: true })
  fs.cpSync(baselineDir, workspaceDir, { recursive: true })
}
