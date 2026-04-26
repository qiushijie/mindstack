import { ref, computed, watch } from 'vue'

export interface HeadingNode {
  text: string
  level: number
  line: number
}

export const currentHeadings = ref<HeadingNode[]>([])
const selectedHeadingLine = ref<number>(1)

const headingRegex = /^(#{1,6})\s+(.+)$/

export function parseHeadings(content: string | undefined): HeadingNode[] {
  if (!content) return []
  const lines = content.split('\n')
  const headings: HeadingNode[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex)
    if (match) {
      headings.push({
        text: match[2].trim(),
        level: match[1].length,
        line: i + 1,
      })
    }
  }

  return headings
}

export function setCurrentHeadings(content: string | undefined) {
  currentHeadings.value = parseHeadings(content)
}

export function setSelectedHeadingLine(line: number) {
  selectedHeadingLine.value = line
}

export function useHeadingTree() {
  return {
    headings: computed(() => currentHeadings.value),
    selectedHeadingLine: computed(() => selectedHeadingLine.value),
  }
}
