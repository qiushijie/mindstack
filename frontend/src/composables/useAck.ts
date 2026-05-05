import { ref } from 'vue'
import { Ack } from '../../wailsjs/go/main/App'

export interface AckSnippet {
  path: string
  startLine: number
  endLine: number
  content: string
  score: number
}

export interface AckResult {
  query: string
  tags: string[]
  summary: string
  snippets: AckSnippet[]
}

export function useAck() {
  const ackLoading = ref(false)
  const ackError = ref('')

  async function ackQuery(query: string): Promise<AckResult | null> {
    ackLoading.value = true
    ackError.value = ''
    try {
      const raw = await Ack(query)
      const parsed = JSON.parse(raw)
      if (parsed.error) {
        ackError.value = parsed.error
        return null
      }
      return parsed as AckResult
    } catch (err: any) {
      ackError.value = err?.message || 'Ack failed'
      return null
    } finally {
      ackLoading.value = false
    }
  }

  return { ackLoading, ackError, ackQuery }
}
