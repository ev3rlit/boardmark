import {
  inferSandpackFileLanguage,
  type SandpackDocument,
  type SandpackFile
} from './sandpack-source-types'
import type { SandpackSourceParser } from './sandpack-source-parser'
import { normalizeSandpackDocument } from './sandpack-source-document'

type LegacySandpackFile =
  | string
  | {
      active?: unknown
      code?: unknown
      hidden?: unknown
      readOnly?: unknown
    }

type LegacySandpackConfig = {
  dependencies?: unknown
  files?: unknown
  layout?: unknown
  options?: unknown
  readOnly?: unknown
  template?: unknown
}

export const sandpackJsonSourceParser: SandpackSourceParser = {
  format: 'json',
  canParse(source) {
    try {
      const parsed = JSON.parse(source)
      return isLegacySandpackConfig(parsed)
    } catch {
      return false
    }
  },
  parse(source) {
    let parsed: unknown

    try {
      parsed = JSON.parse(source)
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'JSON parse failed.')
    }

    if (!isLegacySandpackConfig(parsed)) {
      throw new Error('Sandpack config must be a JSON object.')
    }

    if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
      throw new Error('Sandpack config must include a "files" object.')
    }

    return normalizeSandpackDocument({
      template: typeof parsed.template === 'string' ? parsed.template : undefined,
      files: parseLegacyFiles(parsed.files as Record<string, LegacySandpackFile>),
      dependencies: readStringRecord(parsed.dependencies),
      layout: readLegacyLayout(parsed.layout, parsed.options),
      readOnly: readLegacyReadOnly(parsed.readOnly, parsed.options)
    })
  }
}

function isLegacySandpackConfig(value: unknown): value is LegacySandpackConfig {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseLegacyFiles(files: Record<string, LegacySandpackFile>) {
  const entries = Object.entries(files)

  if (entries.length === 0) {
    throw new Error('Sandpack config must include at least one file.')
  }

  return entries.map(([name, entry]) => parseLegacyFile(name, entry))
}

function parseLegacyFile(name: string, entry: LegacySandpackFile): SandpackFile {
  if (typeof entry === 'string') {
    return {
      name,
      code: entry,
      language: inferSandpackFileLanguage(name)
    }
  }

  if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.code !== 'string') {
    throw new Error(`Sandpack file "${name}" must be a string or file object.`)
  }

  return {
    name,
    code: entry.code,
    language: inferSandpackFileLanguage(name),
    active: entry.active === true ? true : undefined,
    hidden: entry.hidden === true ? true : undefined,
    readOnly: entry.readOnly === true ? true : undefined
  }
}

function readLegacyLayout(layout: unknown, options: unknown): SandpackDocument['layout'] | undefined {
  if (layout === 'code' || layout === 'preview') {
    return layout
  }

  if (isObjectRecord(options) && options.showEditor === true) {
    return 'code'
  }

  return undefined
}

function readLegacyReadOnly(readOnly: unknown, options: unknown) {
  if (readOnly === true) {
    return true
  }

  return isObjectRecord(options) && options.readOnly === true
}

function readStringRecord(value: unknown) {
  if (!isObjectRecord(value)) {
    return undefined
  }

  const record: Record<string, string> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new Error(`Sandpack dependency "${key}" must be a string.`)
    }

    record[key] = entry
  }

  return record
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
