import { describe, it, expect } from 'vitest'
import { createEditorTheme } from '../theme'
import type { Extension } from '@codemirror/state'

describe('theme', () => {
  it('returns extensions for light theme', () => {
    const theme = createEditorTheme(false)
    expect(Array.isArray(theme)).toBe(true)
    expect(theme.length).toBe(2)
    theme.forEach((ext: Extension) => {
      expect(ext).toBeDefined()
    })
  })

  it('returns extensions for dark theme', () => {
    const theme = createEditorTheme(true)
    expect(Array.isArray(theme)).toBe(true)
    expect(theme.length).toBe(2)
    theme.forEach((ext: Extension) => {
      expect(ext).toBeDefined()
    })
  })

  it('produces different extension instances for light and dark', () => {
    const lightTheme = createEditorTheme(false)
    const darkTheme = createEditorTheme(true)
    expect(lightTheme).not.toBe(darkTheme)
    expect(lightTheme[1]).not.toBe(darkTheme[1])
  })
})
