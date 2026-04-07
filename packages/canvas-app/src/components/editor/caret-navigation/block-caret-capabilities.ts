import type {
  CaretCapabilityProvider,
  RawBlockCaretCapability,
  TextFlowCaretCapability,
  GridCaretCapability
} from '@canvas-app/components/editor/caret-navigation/caret-capabilities'

export const textFlowCaretCapability: TextFlowCaretCapability = {
  kind: 'text-flow'
}

export const rawBlockCaretCapability: RawBlockCaretCapability = {
  entryPlacement(direction) {
    return direction === 'down' ? 'leading' : 'trailing'
  },
  exitsAtBoundary({
    direction,
    selectionEnd,
    selectionStart,
    valueLength
  }) {
    if (selectionStart !== selectionEnd) {
      return false
    }

    return direction === 'up'
      ? selectionStart === 0
      : selectionStart === valueLength
  },
  kind: 'raw-block'
}

export const gridCaretCapability: GridCaretCapability = {
  kind: 'grid'
}

const RAW_BLOCK_NODE_NAMES = new Set([
  'wysiwygCodeBlock',
  'wysiwygSpecialFencedBlock',
  'wysiwygHtmlFallbackBlock'
])

export function createDefaultCapabilityProvider(): CaretCapabilityProvider {
  return {
    getForNodeName(nodeName) {
      if (RAW_BLOCK_NODE_NAMES.has(nodeName)) {
        return rawBlockCaretCapability
      }

      return null
    }
  }
}

export const defaultCaretCapabilityProvider = createDefaultCapabilityProvider()
