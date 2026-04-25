import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import {
  resolveImageUrl,
  setFileServerPort,
  setCurrentFilePath,
  currentFilePathField,
  currentFilePathExtension,
} from '../currentFilePath'

beforeEach(() => {
  setFileServerPort(0)
})

describe('resolveImageUrl', () => {
  it('returns empty string for empty url', () => {
    setFileServerPort(9876)
    expect(resolveImageUrl('', '/workspace/readme.md')).toBe('')
  })

  it('passes through http URLs unchanged', () => {
    setFileServerPort(9876)
    expect(resolveImageUrl('http://example.com/img.png', '')).toBe('http://example.com/img.png')
  })

  it('passes through https URLs unchanged', () => {
    setFileServerPort(9876)
    expect(resolveImageUrl('https://example.com/img.png', '')).toBe('https://example.com/img.png')
  })

  it('passes through data URLs unchanged', () => {
    setFileServerPort(9876)
    expect(resolveImageUrl('data:image/png;base64,abc', '')).toBe('data:image/png;base64,abc')
  })

  it('returns raw url when fileServerPort is not set', () => {
    expect(resolveImageUrl('./images/photo.png', '/workspace/readme.md')).toBe('./images/photo.png')
  })

  it('resolves absolute path to local-file URL', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('/workspace/images/photo.png', '/workspace/readme.md')
    expect(result).toBe('http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/images/photo.png'))
  })

  it('resolves relative path with .. segments', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('../assets/img.png', '/workspace/docs/readme.md')
    const expected = 'http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/assets/img.png')
    expect(result).toBe(expected)
  })

  it('resolves relative path with multiple .. segments', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('../../images/photo.png', '/workspace/docs/notes/note.md')
    const expected = 'http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/images/photo.png')
    expect(result).toBe(expected)
  })

  it('resolves relative path in same directory', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('photo.png', '/workspace/docs/readme.md')
    const expected = 'http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/docs/photo.png')
    expect(result).toBe(expected)
  })

  it('resolves relative path with ./ prefix', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('./images/photo.png', '/workspace/docs/readme.md')
    const expected = 'http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/docs/images/photo.png')
    expect(result).toBe(expected)
  })

  it('returns raw url for relative path without filePath', () => {
    setFileServerPort(9876)
    expect(resolveImageUrl('photo.png', '')).toBe('photo.png')
  })

  it('handles path with mixed . and .. segments', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('./sub/../photo.png', '/workspace/docs/readme.md')
    const expected = 'http://127.0.0.1:9876/local-file/' + encodeURIComponent('/workspace/docs/photo.png')
    expect(result).toBe(expected)
  })

  it('encodes special characters in path', () => {
    setFileServerPort(9876)
    const result = resolveImageUrl('/workspace/images/my photo.png', '')
    expect(result).toContain(encodeURIComponent('/workspace/images/my photo.png'))
  })

  it('uses different port number', () => {
    setFileServerPort(5000)
    const result = resolveImageUrl('/workspace/img.png', '')
    expect(result).toContain('127.0.0.1:5000')
  })
})

describe('setFileServerPort', () => {
  it('updates port used by resolveImageUrl', () => {
    setFileServerPort(1234)
    const result = resolveImageUrl('/img.png', '')
    expect(result).toContain(':1234')
  })
})

describe('currentFilePathField', () => {
  it('has empty string as default value', () => {
    const state = EditorState.create({
      extensions: [markdown({ extensions: GFM }), currentFilePathExtension()],
    })
    expect(state.field(currentFilePathField)).toBe('')
  })

  it('updates value via setCurrentFilePath effect', () => {
    const state = EditorState.create({
      extensions: [markdown({ extensions: GFM }), currentFilePathExtension()],
    })
    const newState = state.update({ effects: setCurrentFilePath.of('/workspace/doc.md') }).state
    expect(newState.field(currentFilePathField)).toBe('/workspace/doc.md')
  })

  it('overwrites previous value', () => {
    let state = EditorState.create({
      extensions: [markdown({ extensions: GFM }), currentFilePathExtension()],
    })
    state = state.update({ effects: setCurrentFilePath.of('/a.md') }).state
    state = state.update({ effects: setCurrentFilePath.of('/b.md') }).state
    expect(state.field(currentFilePathField)).toBe('/b.md')
  })

  it('preserves value on document change', () => {
    let state = EditorState.create({
      doc: 'hello',
      extensions: [markdown({ extensions: GFM }), currentFilePathExtension()],
    })
    state = state.update({ effects: setCurrentFilePath.of('/doc.md') }).state
    state = state.update({ changes: { from: 0, insert: 'world ' } }).state
    expect(state.field(currentFilePathField)).toBe('/doc.md')
  })
})
