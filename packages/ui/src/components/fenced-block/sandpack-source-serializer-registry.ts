import { sandpackJsonSourceSerializer } from './sandpack-json-source-serializer'
import { sandpackNestedSourceSerializer } from './sandpack-nested-source-serializer'
import type { SandpackSourceSerializer } from './sandpack-source-serializer'
import type { SandpackDocument, SandpackSourceFormat } from './sandpack-source-types'

const DEFAULT_SANDPACK_SOURCE_FORMAT: SandpackSourceFormat = 'nested'

const sandpackSourceSerializers: Record<SandpackSourceFormat, SandpackSourceSerializer> = {
  json: sandpackJsonSourceSerializer,
  nested: sandpackNestedSourceSerializer
}

export function getRegisteredSandpackSourceSerializers() {
  return sandpackSourceSerializers
}

export function serializeSandpackSource(
  document: SandpackDocument,
  format: SandpackSourceFormat = DEFAULT_SANDPACK_SOURCE_FORMAT
) {
  const serializer = sandpackSourceSerializers[format]

  if (!serializer) {
    throw new Error(`Unsupported sandpack serializer format "${format}".`)
  }

  return serializer.serialize(document)
}

export function serializeSandpackSourceBody(
  document: SandpackDocument,
  format: SandpackSourceFormat = DEFAULT_SANDPACK_SOURCE_FORMAT
) {
  const serialized = serializeSandpackSource(document, format)
  const lines = serialized.replace(/\r\n/g, '\n').split('\n')

  if (lines.length < 3) {
    throw new Error('Serialized sandpack source must contain opening and closing fences.')
  }

  return lines.slice(1, -2).join('\n')
}
