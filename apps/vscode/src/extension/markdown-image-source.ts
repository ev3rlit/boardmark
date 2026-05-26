import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type MarkdownImageSourceResolution =
  | {
      readonly kind: 'passthrough'
      readonly src: string
    }
  | {
      readonly kind: 'file'
      readonly fsPath: string
      readonly query: string
      readonly fragment: string
    }

export type MarkdownImageSourceError = {
  readonly message: string
}

export type MarkdownImageSourceResult =
  | { readonly ok: true; readonly value: MarkdownImageSourceResolution }
  | { readonly ok: false; readonly error: MarkdownImageSourceError }

export function resolveMarkdownImageSource(input: {
  readonly documentFsPath: string
  readonly src: string
  readonly workspaceFolderFsPath?: string
}): MarkdownImageSourceResult {
  const src = input.src.trim()

  if (src.length === 0) {
    return imageSourceError('Image source is empty.')
  }

  if (isPassthroughImageSource(src)) {
    return {
      ok: true,
      value: {
        kind: 'passthrough',
        src
      }
    }
  }

  if (/^file:/i.test(src)) {
    return resolveFileUrlImageSource(src, input.workspaceFolderFsPath)
  }

  const parts = splitImageSourceReference(src)
  const pathResult = decodeImagePath(parts.path)

  if (!pathResult.ok) {
    return pathResult
  }

  const basePath = parts.path.startsWith('/')
    ? input.workspaceFolderFsPath
    : dirname(input.documentFsPath)

  if (!basePath) {
    return imageSourceError(
      'Workspace-relative image paths require the Boardmark document to be inside a workspace folder.'
    )
  }

  const relativeImagePath = parts.path.startsWith('/')
    ? pathResult.value.replace(/^\/+/, '')
    : pathResult.value
  const fsPath = resolve(basePath, relativeImagePath)
  const boundaryPath = input.workspaceFolderFsPath ?? dirname(input.documentFsPath)

  if (!isPathInsideOrEqual(boundaryPath, fsPath)) {
    return imageSourceError('Image source must stay inside the current workspace or document folder.')
  }

  return {
    ok: true,
    value: {
      kind: 'file',
      fsPath,
      query: parts.query,
      fragment: parts.fragment
    }
  }
}

function resolveFileUrlImageSource(
  src: string,
  workspaceFolderFsPath: string | undefined
): MarkdownImageSourceResult {
  try {
    const url = new URL(src)
    const fsPath = fileURLToPath(url)

    if (workspaceFolderFsPath && !isPathInsideOrEqual(workspaceFolderFsPath, fsPath)) {
      return imageSourceError('Image source must stay inside the current workspace folder.')
    }

    return {
      ok: true,
      value: {
        kind: 'file',
        fsPath,
        query: url.search.startsWith('?') ? url.search.slice(1) : url.search,
        fragment: url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
      }
    }
  } catch {
    return imageSourceError('Image source is not a valid file URI.')
  }
}

function splitImageSourceReference(src: string): {
  readonly path: string
  readonly query: string
  readonly fragment: string
} {
  const hashIndex = src.indexOf('#')
  const beforeHash = hashIndex >= 0 ? src.slice(0, hashIndex) : src
  const fragment = hashIndex >= 0 ? src.slice(hashIndex + 1) : ''
  const queryIndex = beforeHash.indexOf('?')

  if (queryIndex < 0) {
    return {
      path: beforeHash,
      query: '',
      fragment
    }
  }

  return {
    path: beforeHash.slice(0, queryIndex),
    query: beforeHash.slice(queryIndex + 1),
    fragment
  }
}

function decodeImagePath(path: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: MarkdownImageSourceError } {
  if (path.length === 0) {
    return imageSourceError('Image source path is empty.')
  }

  try {
    const decoded = decodeURIComponent(path)

    if (isAbsolute(decoded) && !path.startsWith('/')) {
      return imageSourceError('Image source must be relative to the document or workspace folder.')
    }

    return {
      ok: true,
      value: decoded
    }
  } catch {
    return imageSourceError('Image source path is not valid URI encoding.')
  }
}

function isPassthroughImageSource(src: string): boolean {
  return /^(https?:|data:|blob:)/i.test(src)
}

function isPathInsideOrEqual(parentPath: string, targetPath: string): boolean {
  const relation = relative(parentPath, targetPath)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

function imageSourceError(message: string): { readonly ok: false; readonly error: MarkdownImageSourceError } {
  return {
    ok: false,
    error: {
      message
    }
  }
}
