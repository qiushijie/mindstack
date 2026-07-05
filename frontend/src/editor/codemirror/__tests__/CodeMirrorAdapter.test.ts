import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { search } from '@codemirror/search'
import { CodeMirrorAdapter } from '../CodeMirrorAdapter'

function createSearchableView(doc: string): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [search()],
  })
  return new EditorView({ state, parent: document.body })
}

describe('CodeMirrorAdapter', () => {
  let view: EditorView
  let adapter: CodeMirrorAdapter

  beforeEach(() => {
    view = createSearchableView('')
    adapter = new CodeMirrorAdapter(view)
  })

  afterEach(() => {
    view.destroy()
  })

  describe('getContent / setContent', () => {
    it('基本读写内容', () => {
      adapter.setContent('hello world')
      expect(adapter.getContent()).toBe('hello world')
    })

    it('setContent 覆盖整个文档并把选区重置到开头', () => {
      adapter.setContent('hello')
      expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })

      view.dispatch({ selection: { anchor: 3, head: 3 } })
      adapter.setContent('world')
      expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
    })

    it('preserveSelection 为 true 时保留选区并在新文档长度内 clamp', () => {
      adapter.setContent('hello world')
      view.dispatch({ selection: { anchor: 11, head: 11 } })
      expect(adapter.getSelection()).toEqual({ anchor: 11, head: 11 })

      adapter.setContent('hi', { preserveSelection: true })
      expect(adapter.getContent()).toBe('hi')
      expect(adapter.getSelection()).toEqual({ anchor: 2, head: 2 })
    })

    it('preserveSelection 把负数选区 clamp 到 0', () => {
      view.dispatch({ selection: { anchor: -5, head: -5 } })
      adapter.setContent('hi', { preserveSelection: true })
      expect(adapter.getSelection()).toEqual({ anchor: 0, head: 0 })
    })
  })

  describe('selection', () => {
    it('setSelection 设置光标位置', () => {
      adapter.setContent('hello world')
      adapter.setSelection({ anchor: 5 })
      expect(adapter.getSelection()).toEqual({ anchor: 5, head: 5 })
    })

    it('setSelection 设置 range 选区', () => {
      adapter.setContent('hello world')
      adapter.setSelection({ anchor: 2, head: 7 })
      expect(adapter.getSelection()).toEqual({ anchor: 2, head: 7 })
    })

    it('setSelection 支持 scroll 选项且不会抛错', () => {
      adapter.setContent('hello world')
      expect(() => adapter.setSelection({ anchor: 5 }, { scroll: true })).not.toThrow()
    })

    it('getSelectedText 在空选区返回 null', () => {
      adapter.setContent('hello')
      expect(adapter.getSelectedText()).toBeNull()
    })

    it('getSelectedText 返回选中文本', () => {
      adapter.setContent('hello world')
      adapter.setSelection({ anchor: 0, head: 5 })
      expect(adapter.getSelectedText()).toBe('hello')
    })
  })

  describe('replaceRange', () => {
    it('基本替换并把光标放到 from + insert.length', () => {
      adapter.setContent('hello world')
      adapter.replaceRange(
        { from: 6, to: 11, insert: 'universe' },
        { selection: { anchor: 14 } },
      )
      expect(adapter.getContent()).toBe('hello universe')
      expect(adapter.getSelection()).toEqual({ anchor: 14, head: 14 })
    })

    it('短文本替换成长文本时，光标不会跳到旧文档末尾', () => {
      adapter.setContent('abc')
      adapter.replaceRange(
        { from: 0, to: 1, insert: 'verylongtext' },
        { selection: { anchor: 12 } },
      )
      expect(adapter.getContent()).toBe('verylongtextbc')
      expect(adapter.getSelection()).toEqual({ anchor: 12, head: 12 })
    })

    it('传出的 selection 被正确 clamp 到新文档长度边界', () => {
      adapter.setContent('abc')
      adapter.replaceRange(
        { from: 0, to: 1, insert: 'x' },
        { selection: { anchor: 100, head: 200 } },
      )
      expect(adapter.getContent()).toBe('xbc')
      expect(adapter.getSelection()).toEqual({ anchor: 3, head: 3 })
    })

    it('change.from / change.to 越界时被 clamp', () => {
      adapter.setContent('abc')
      adapter.replaceRange({ from: -10, to: 100, insert: 'x' })
      expect(adapter.getContent()).toBe('x')
    })

    it('未传 selection 时只替换内容，不主动设置选区', () => {
      adapter.setContent('hello world')
      adapter.replaceRange({ from: 6, to: 11, insert: 'coders' })
      expect(adapter.getContent()).toBe('hello coders')
    })
  })

  describe('focus / cursor / scroll', () => {
    it('focus 调用不抛错', () => {
      expect(() => adapter.focus()).not.toThrow()
    })

    it('moveCursorToEnd 将光标移动到文档末尾', () => {
      adapter.setContent('hello')
      adapter.moveCursorToEnd()
      expect(adapter.getSelection()).toEqual({ anchor: 5, head: 5 })
    })

    it('scrollToLine 将选区移动到指定行开头', () => {
      adapter.setContent('line1\nline2\nline3')
      adapter.scrollToLine(2)
      expect(adapter.getSelection()).toEqual({ anchor: 6, head: 6 })
    })

    it('scrollToLine 对无效行号静默处理', () => {
      adapter.setContent('hello')
      expect(() => adapter.scrollToLine(999)).not.toThrow()
    })
  })

  describe('geometry / DOM', () => {
    it('coordsAtPos 返回 DOMRect 或 null', () => {
      adapter.setContent('hello')
      const rect = adapter.coordsAtPos(0)
      expect(rect === null || rect instanceof DOMRect).toBe(true)
    })

    it('posAtCoords 是可选方法且调用不抛错', () => {
      expect(typeof adapter.posAtCoords).toBe('function')
      const result = adapter.posAtCoords!({ x: 0, y: 0 })
      expect(typeof result === 'number' || result === null).toBe(true)
    })

    it('getDOM 返回编辑器的 DOM 元素', () => {
      expect(adapter.getDOM()).toBe(view.dom)
    })
  })

  describe('status', () => {
    it('getCursorPosition 返回正确的行列号', () => {
      adapter.setContent('line1\nline2')
      adapter.setSelection({ anchor: 8 })
      expect(adapter.getCursorPosition()).toEqual({ line: 2, column: 3 })
    })

    it('getLineAt 返回指定位置所在行', () => {
      adapter.setContent('line1\nline2')
      expect(adapter.getLineAt(8)).toMatchObject({
        number: 2,
        text: 'line2',
      })
    })

    it('getLineAt 对越界位置 clamp 到文档边界', () => {
      adapter.setContent('abc')
      expect(adapter.getLineAt(100).text).toBe('abc')
    })

    it('getLine 返回指定行信息', () => {
      adapter.setContent('line1\nline2')
      expect(adapter.getLine(2)).toMatchObject({
        number: 2,
        text: 'line2',
      })
    })

    it('getLine 对无效行号返回 null', () => {
      adapter.setContent('hello')
      expect(adapter.getLine(0)).toBeNull()
      expect(adapter.getLine(999)).toBeNull()
    })

    it('getStats 返回字符数和单词数', () => {
      adapter.setContent('hello world')
      expect(adapter.getStats()).toEqual({ chars: 11, words: 2 })
    })
  })

  describe('search', () => {
    it('getSearchMatchInfo 返回当前匹配项和总数', () => {
      adapter.setContent('foo bar foo baz foo')
      adapter.setSearchQuery({ search: 'foo' })

      const info = adapter.getSearchMatchInfo()
      expect(info).toEqual({ current: 1, total: 3 })
    })

    it('getSearchMatchInfo 没有匹配时返回零', () => {
      adapter.setContent('hello world')
      adapter.setSearchQuery({ search: 'foo' })

      expect(adapter.getSearchMatchInfo()).toEqual({ current: 0, total: 0 })
    })

    it('getSearchMatchInfo 根据光标位置计算 current', () => {
      adapter.setContent('foo bar foo')
      adapter.setSearchQuery({ search: 'foo' })
      view.dispatch({ selection: { anchor: 8, head: 8 } })

      expect(adapter.getSearchMatchInfo()).toEqual({ current: 2, total: 2 })
    })

    it('setSearchQuery 支持 caseSensitive', () => {
      adapter.setContent('Foo foo')
      adapter.setSearchQuery({ search: 'foo', caseSensitive: true })
      expect(adapter.getSearchMatchInfo()).toEqual({ current: 1, total: 1 })
    })

    it('clearSearchQuery 清空查询', () => {
      adapter.setContent('foo foo')
      adapter.setSearchQuery({ search: 'foo' })
      expect(adapter.getSearchMatchInfo()?.total).toBe(2)

      adapter.clearSearchQuery()
      expect(adapter.getSearchMatchInfo()).toEqual({ current: 0, total: 0 })
    })

    it('findNext 和 findPrevious 调用不抛错并返回布尔值', () => {
      adapter.setContent('foo bar foo')
      adapter.setSearchQuery({ search: 'foo' })
      expect(typeof adapter.findNext()).toBe('boolean')
      expect(typeof adapter.findPrevious()).toBe('boolean')
    })
  })
})
