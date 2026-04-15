import type { SandpackDocument, SandpackSourceFormat } from './sandpack-source-types'

export interface SandpackSourceParser {
  readonly format: SandpackSourceFormat
  canParse(source: string): boolean
  parse(source: string): SandpackDocument
}
