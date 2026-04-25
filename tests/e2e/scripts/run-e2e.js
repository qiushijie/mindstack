const { spawn } = require('child_process')
const waitOn = require('wait-on')
const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.join(__dirname, '..', '..', '..')
const LOG_FILE = path.join(__dirname, '..', 'wails-dev.log')
const PID_FILE = path.join(__dirname, '..', 'wails-dev.pid')

function extractUrl(log) {
  const match = log.match(/http:\/\/localhost:\d+/)
  return match ? match[0] : null
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function startWailsDev() {
  if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE)

  console.log('[e2e] Starting wails dev...')
  const child = spawn('wails', ['dev'], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  })

  const logStream = fs.createWriteStream(LOG_FILE)
  child.stdout.pipe(logStream)
  child.stderr.pipe(logStream)

  fs.writeFileSync(PID_FILE, child.pid.toString())

  // Wait for URL in log output
  let url = null
  for (let i = 0; i < 120; i++) {
    await sleep(1000)
    if (fs.existsSync(LOG_FILE)) {
      const log = fs.readFileSync(LOG_FILE, 'utf8')
      url = extractUrl(log)
      if (url) break
    }
  }

  if (!url) {
    console.error('[e2e] Failed to detect Wails dev URL within 120s')
    child.kill('SIGTERM')
    process.exit(1)
  }

  console.log(`[e2e] Detected Wails dev at ${url}`)

  // Wait for server to respond
  try {
    await waitOn({ resources: [url], timeout: 30000 })
    console.log('[e2e] Server is responding')
  } catch (err) {
    console.error('[e2e] Server did not respond:', err.message)
    child.kill('SIGTERM')
    process.exit(1)
  }

  process.env.WAILS_DEV_URL = url
  return child
}

async function checkExisting() {
  if (!fs.existsSync(PID_FILE)) return null
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10)
  try {
    process.kill(pid, 0)
  } catch {
    fs.unlinkSync(PID_FILE)
    return null
  }

  // Process exists, extract URL from log
  if (fs.existsSync(LOG_FILE)) {
    const log = fs.readFileSync(LOG_FILE, 'utf8')
    const url = extractUrl(log)
    if (url) {
      process.env.WAILS_DEV_URL = url
      console.log(`[e2e] Wails dev already running at ${url}`)
      return 'existing'
    }
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const existing = await checkExisting()
  let wailsProcess = null

  if (!existing) {
    wailsProcess = await startWailsDev()
  }

  // Run Playwright
  const pw = spawn('pnpm', ['playwright', 'test', ...args], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  })

  const exitCode = await new Promise((resolve) => {
    pw.on('close', resolve)
  })

  // Cleanup
  if (wailsProcess && !args.includes('--watch')) {
    console.log('[e2e] Shutting down Wails dev...')
    wailsProcess.kill('SIGTERM')
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE)
  }

  process.exit(exitCode)
}

main().catch((err) => {
  console.error('[e2e] Fatal error:', err)
  process.exit(1)
})
