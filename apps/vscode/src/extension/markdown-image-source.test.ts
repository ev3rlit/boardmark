import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  readMarkdownAssetDirectoryName,
  resolveMarkdownImageSource,
  toDocumentRelativeMarkdownPath
} from './markdown-image-source'

describe('resolveMarkdownImageSource', () => {
  it('keeps remote and embedded sources unchanged', () => {
    expect(resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: 'https://example.com/image.png',
      workspaceFolderFsPath: '/workspace'
    })).toEqual({
      ok: true,
      value: {
        kind: 'passthrough',
        src: 'https://example.com/image.png'
      }
    })

    expect(resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: 'data:image/png;base64,aaa',
      workspaceFolderFsPath: '/workspace'
    })).toEqual({
      ok: true,
      value: {
        kind: 'passthrough',
        src: 'data:image/png;base64,aaa'
      }
    })
  })

  it('resolves document-relative paths from the document directory', () => {
    expect(resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: './assets/diagram%201.png?raw=1#preview',
      workspaceFolderFsPath: '/workspace'
    })).toEqual({
      ok: true,
      value: {
        kind: 'file',
        fsPath: resolve('/workspace/docs/assets/diagram 1.png'),
        query: 'raw=1',
        fragment: 'preview'
      }
    })
  })

  it('resolves leading slash paths from the workspace root', () => {
    expect(resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: '/assets/logo.png',
      workspaceFolderFsPath: '/workspace'
    })).toEqual({
      ok: true,
      value: {
        kind: 'file',
        fsPath: resolve('/workspace/assets/logo.png'),
        query: '',
        fragment: ''
      }
    })
  })

  it('rejects local paths that escape the workspace boundary', () => {
    const result = resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: '../outside.png',
      workspaceFolderFsPath: '/workspace/docs'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('inside')
    }
  })

  it('requires a workspace folder for leading slash paths', () => {
    const result = resolveMarkdownImageSource({
      documentFsPath: '/workspace/docs/board.md',
      src: '/assets/logo.png'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain('workspace')
    }
  })

  it('uses md-first asset directory names with legacy canvas md compatibility', () => {
    expect(readMarkdownAssetDirectoryName('/workspace/docs/board.md')).toBe('board.assets')
    expect(readMarkdownAssetDirectoryName('/workspace/docs/legacy.canvas.md')).toBe('legacy.assets')
  })

  it('returns document-relative markdown paths for imported assets', () => {
    expect(toDocumentRelativeMarkdownPath({
      documentFsPath: '/workspace/docs/board.md',
      targetFsPath: '/workspace/docs/board.assets/pasted.png'
    })).toBe('./board.assets/pasted.png')
  })
})
