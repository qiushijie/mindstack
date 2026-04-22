import { describe, it, expect } from 'vitest'
import { BlockType } from '../blockType'
import { BLOCK_REGISTRY, getBlockConfig, getBlockConfigByToolbarLabel, getBlockConfigByPrefix } from '../blockRegistry'

describe('getBlockConfig', () => {
  it('returns correct config for H1', () => {
    const config = getBlockConfig(BlockType.H1)
    expect(config).toBeDefined()
    expect(config!.type).toBe(BlockType.H1)
    expect(config!.label).toBe('Heading 1')
    expect(config!.prefix).toBe('# ')
  })

  it('returns undefined for non-existent type', () => {
    const config = getBlockConfig('NonExistent' as BlockType)
    expect(config).toBeUndefined()
  })
})

describe('getBlockConfigByToolbarLabel', () => {
  it('returns correct config for H1 label', () => {
    const config = getBlockConfigByToolbarLabel('H1')
    expect(config).toBeDefined()
    expect(config!.type).toBe(BlockType.H1)
  })

  it('returns undefined for non-existent label', () => {
    const config = getBlockConfigByToolbarLabel('NonExistent')
    expect(config).toBeUndefined()
  })
})

describe('getBlockConfigByPrefix', () => {
  it('returns H1 config for "# " prefix', () => {
    const config = getBlockConfigByPrefix('# ')
    expect(config).toBeDefined()
    expect(config!.type).toBe(BlockType.H1)
  })

  it('returns undefined for non-existent prefix', () => {
    const config = getBlockConfigByPrefix('!!! ')
    expect(config).toBeUndefined()
  })
})

describe('BLOCK_REGISTRY integrity', () => {
  it('every entry has required fields', () => {
    for (const entry of BLOCK_REGISTRY) {
      expect(entry.type).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
      expect(entry.prefix).toBeTruthy()
      expect(entry.example).toBeTruthy()
    }
  })

  it('every toolbarLabel is unique', () => {
    const labels = BLOCK_REGISTRY
      .filter(c => c.toolbarLabel)
      .map(c => c.toolbarLabel!)
    const uniqueLabels = new Set(labels)
    expect(uniqueLabels.size).toBe(labels.length)
  })

  it('every keymap is unique', () => {
    const keymaps = BLOCK_REGISTRY
      .filter(c => c.keymap)
      .map(c => c.keymap!)
    const uniqueKeymaps = new Set(keymaps)
    expect(uniqueKeymaps.size).toBe(keymaps.length)
  })
})
