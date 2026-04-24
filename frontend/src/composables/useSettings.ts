import { ref, watch, nextTick } from 'vue'
import { LoadConfig, SaveConfig } from '../../wailsjs/go/main/App'

const autoSave = ref(true)
const autoSaveDelay = ref(5)

let loaded = false
let skipWatch = false

function parseDelay(raw: string | number): number {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10)
  return isNaN(n) || n < 1 ? 5 : n
}

export function useSettings() {
  async function loadSettings() {
    if (loaded) return
    skipWatch = true
    loaded = true
    try {
      const raw = await LoadConfig()
      const config = JSON.parse(raw || '{}')
      const s = config.settings || {}
      if (s.autoSave !== undefined) autoSave.value = s.autoSave
      if (s.autoSaveDelay !== undefined) autoSaveDelay.value = parseDelay(s.autoSaveDelay)
    } catch {
      // use defaults
    }
    await nextTick()
    skipWatch = false
  }

  return { autoSave, autoSaveDelay, loadSettings }
}

watch([autoSave, autoSaveDelay], async () => {
  if (!loaded || skipWatch) return
  try {
    const raw = await LoadConfig()
    const config = JSON.parse(raw || '{}')
    config.settings = {
      autoSave: autoSave.value,
      autoSaveDelay: autoSaveDelay.value,
    }
    await SaveConfig(JSON.stringify(config))
  } catch {
    // ignore save errors
  }
})
