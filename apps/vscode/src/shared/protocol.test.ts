import { describe, expect, it } from 'vitest'
import { isHostToWebviewMessage, isWebviewToHostMessage } from './protocol'

describe('VS Code webview protocol guards', () => {
  it('requires correlation ids for document edits and saves', () => {
    expect(isWebviewToHostMessage({
      type: 'document/edit',
      id: 'edit-1',
      revision: 3,
      nextSource: '---\ntype: canvas\nversion: 2\n---\n'
    })).toBe(true)

    expect(isWebviewToHostMessage({
      type: 'document/edit',
      revision: 3,
      nextSource: '---\ntype: canvas\nversion: 2\n---\n'
    })).toBe(false)

    expect(isWebviewToHostMessage({
      type: 'document/save',
      id: 'save-1'
    })).toBe(true)
  })

  it('accepts host sync, error, and response messages', () => {
    expect(isHostToWebviewMessage({
      type: 'document/sync',
      revision: 1,
      source: '---\ntype: canvas\nversion: 2\n---\n',
      uri: 'file:///workspace/board.md'
    })).toBe(true)

    expect(isHostToWebviewMessage({
      type: 'document/error',
      message: 'Not a Boardmark document.',
      uri: 'file:///workspace/readme.md'
    })).toBe(true)

    expect(isHostToWebviewMessage({
      type: 'response',
      id: 'edit-1',
      ok: false,
      error: 'stale revision'
    })).toBe(true)
  })

  it('accepts image bridge requests with correlation ids', () => {
    expect(isWebviewToHostMessage({
      type: 'request',
      id: 'image-1',
      method: 'image/resolve',
      payload: {
        documentUri: 'file:///workspace/board.md',
        src: './assets/example.png'
      }
    })).toBe(true)

    expect(isWebviewToHostMessage({
      type: 'request',
      id: 'image-2',
      method: 'image/export'
    })).toBe(false)
  })

  it('accepts implemented image import and export bridge requests', () => {
    expect(isWebviewToHostMessage({
      type: 'request',
      id: 'image-import-1',
      method: 'image/import',
      payload: {
        bytes: [137, 80, 78, 71],
        documentUri: 'file:///workspace/board.md',
        fileName: 'pasted.png'
      }
    })).toBe(true)

    expect(isWebviewToHostMessage({
      type: 'request',
      id: 'image-export-1',
      method: 'image-export/save',
      payload: {
        bytes: [137, 80, 78, 71],
        fileName: 'board.png',
        mimeType: 'image/png'
      }
    })).toBe(true)
  })

  it('accepts VS Code theme change events', () => {
    expect(isHostToWebviewMessage({
      type: 'theme/changed',
      kind: 'dark'
    })).toBe(true)

    expect(isHostToWebviewMessage({
      type: 'theme/changed',
      kind: 'dim'
    })).toBe(false)
  })
})
