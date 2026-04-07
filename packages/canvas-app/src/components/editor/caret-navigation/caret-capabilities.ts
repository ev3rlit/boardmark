export type CaretDirection = 'down' | 'up'

export type EntryPlacement = 'leading' | 'trailing'

export type TextFlowCaretCapability = {
  kind: 'text-flow'
}

export type RawBlockCaretCapability = {
  entryPlacement: (direction: CaretDirection) => EntryPlacement
  exitsAtBoundary: (input: {
    direction: CaretDirection
    selectionEnd: number
    selectionStart: number
    valueLength: number
  }) => boolean
  kind: 'raw-block'
}

export type GridCaretCapability = {
  kind: 'grid'
}

export type BlockCaretCapability = GridCaretCapability | RawBlockCaretCapability

export type CaretCapability = BlockCaretCapability | TextFlowCaretCapability

export interface CaretCapabilityProvider {
  getForNodeName(nodeName: string): CaretCapability | null
}

export function isBlockCaretCapability(
  capability: CaretCapability | null
): capability is BlockCaretCapability {
  return capability?.kind === 'grid' || capability?.kind === 'raw-block'
}
