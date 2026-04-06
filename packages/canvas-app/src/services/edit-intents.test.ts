import { describe, expect, it } from 'vitest'
import { readCanvasDocumentEditLabel } from '@canvas-app/services/edit-intents'

describe('canvas edit intent labels', () => {
  it('returns the shared label for history and transaction flows', () => {
    expect(readCanvasDocumentEditLabel({
      kind: 'move-node',
      nodeId: 'welcome',
      x: 120,
      y: 140
    })).toBe('Move node')

    expect(readCanvasDocumentEditLabel({
      kind: 'move-nodes',
      moves: [
        {
          nodeId: 'welcome',
          x: 120,
          y: 140
        },
        {
          nodeId: 'overview',
          x: 420,
          y: 180
        }
      ]
    })).toBe('Move node')

    expect(readCanvasDocumentEditLabel({
      kind: 'set-objects-locked',
      groupIds: [],
      nodeIds: ['welcome'],
      edgeIds: [],
      locked: true
    })).toBe('Lock selection')

    expect(readCanvasDocumentEditLabel({
      kind: 'set-objects-locked',
      groupIds: [],
      nodeIds: ['welcome'],
      edgeIds: [],
      locked: false
    })).toBe('Unlock selection')
  })
})
