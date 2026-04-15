import type { SandpackSourceSerializer } from './sandpack-source-serializer'
import { serializeSandpackJsonOptions } from './sandpack-source-document'

export const sandpackNestedSourceSerializer: SandpackSourceSerializer = {
  format: 'nested',
  serialize(document) {
    const lines = ['````sandpack', serializeSandpackJsonOptions(document), '']

    for (const file of document.files) {
      lines.push(`\`\`\`${file.name}`)
      lines.push(...normalizeFileCode(file.code).split('\n'))
      lines.push('```')
      lines.push('')
    }

    while (lines[lines.length - 1] === '') {
      lines.pop()
    }

    lines.push('````', '')

    return lines.join('\n')
  }
}

function normalizeFileCode(code: string) {
  return code.replace(/\r\n/g, '\n')
}
