import { StateEffect, StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'

export const setCurrentFilePath = StateEffect.define<string>()

export const currentFilePathField = StateField.define<string>({
  create: () => '',
  update: (value, tr) => {
    for (const e of tr.effects) {
      if (e.is(setCurrentFilePath)) return e.value
    }
    return value
  },
})

let fileServerPort = 0

export function setFileServerPort(port: number) {
  fileServerPort = port
}

export function resolveImageUrl(rawUrl: string, filePath: string): string {
  if (!rawUrl) return rawUrl

  if (/^(https?:\/\/|data:)/i.test(rawUrl)) {
    return rawUrl
  }

  if (!fileServerPort) return rawUrl

  let absolutePath: string

  if (rawUrl.startsWith('/')) {
    absolutePath = rawUrl
  } else {
    if (!filePath) return rawUrl
    const dir = filePath.substring(0, filePath.lastIndexOf('/'))
    const parts = dir.split('/')
    for (const seg of rawUrl.split('/')) {
      if (seg === '..') {
        parts.pop()
      } else if (seg !== '.' && seg !== '') {
        parts.push(seg)
      }
    }
    absolutePath = parts.join('/')
  }

  return `http://127.0.0.1:${fileServerPort}/local-file/` + encodeURIComponent(absolutePath)
}

export function currentFilePathExtension(): Extension {
  return currentFilePathField
}
