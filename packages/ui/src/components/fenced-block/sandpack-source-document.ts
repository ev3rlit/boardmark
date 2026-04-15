import { SANDPACK_DEFAULT_TEMPLATE } from '../../lib/sandpack-config'
import type { SandpackDocument } from './sandpack-source-types'

type ParsedOptions = {
  dependencies?: Record<string, string>
  layout?: 'code' | 'preview'
  readOnly?: boolean
  template?: string
}

export function normalizeSandpackDocument(input: {
  dependencies?: Record<string, string>
  files: SandpackDocument['files']
  layout?: string
  readOnly?: boolean
  template?: string
}): SandpackDocument {
  return {
    template: typeof input.template === 'string' && input.template.trim().length > 0
      ? input.template.trim()
      : SANDPACK_DEFAULT_TEMPLATE,
    files: input.files,
    dependencies: input.dependencies && Object.keys(input.dependencies).length > 0
      ? input.dependencies
      : undefined,
    layout: input.layout === 'code' ? 'code' : 'preview',
    readOnly: input.readOnly === true
  }
}

export function parseSandpackJsonOptions(source: string): ParsedOptions {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Sandpack header JSON could not be parsed.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Sandpack header must be a JSON object.')
  }

  const value = parsed as Record<string, unknown>

  return {
    template: typeof value.template === 'string' ? value.template : undefined,
    layout: value.layout === 'code' || value.layout === 'preview' ? value.layout : undefined,
    readOnly: value.readOnly === true,
    dependencies: readStringRecord(value.dependencies)
  }
}

export function serializeSandpackJsonOptions(document: SandpackDocument) {
  return JSON.stringify({
    template: document.template,
    ...(document.layout === 'code' ? { layout: 'code' } : {}),
    ...(document.readOnly ? { readOnly: true } : {}),
    ...(document.dependencies ? { dependencies: document.dependencies } : {})
  }, null, 2)
}

function readStringRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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
