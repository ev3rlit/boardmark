import { describe, expect, it } from 'vitest'
import {
  createDefaultCapabilityProvider,
  rawBlockCaretCapability
} from '@canvas-app/components/editor/caret-navigation/block-caret-capabilities'

describe('block caret capabilities', () => {
  it('reuses one raw-block capability for all raw block node types', () => {
    const provider = createDefaultCapabilityProvider()

    expect(provider.getForNodeName('wysiwygCodeBlock')).toBe(rawBlockCaretCapability)
    expect(provider.getForNodeName('wysiwygSpecialFencedBlock')).toBe(rawBlockCaretCapability)
    expect(provider.getForNodeName('wysiwygHtmlFallbackBlock')).toBe(rawBlockCaretCapability)
    expect(provider.getForNodeName('paragraph')).toBeNull()
  })

  it('uses one boundary model for raw-block entry and exit', () => {
    expect(rawBlockCaretCapability.entryPlacement('down')).toBe('leading')
    expect(rawBlockCaretCapability.entryPlacement('up')).toBe('trailing')

    expect(rawBlockCaretCapability.exitsAtBoundary({
      direction: 'up',
      selectionEnd: 0,
      selectionStart: 0,
      valueLength: 10
    })).toBe(true)

    expect(rawBlockCaretCapability.exitsAtBoundary({
      direction: 'down',
      selectionEnd: 10,
      selectionStart: 10,
      valueLength: 10
    })).toBe(true)

    expect(rawBlockCaretCapability.exitsAtBoundary({
      direction: 'down',
      selectionEnd: 5,
      selectionStart: 2,
      valueLength: 10
    })).toBe(false)
  })
})
