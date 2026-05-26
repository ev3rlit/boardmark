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
})
