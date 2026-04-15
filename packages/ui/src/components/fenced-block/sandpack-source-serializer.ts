import type { SandpackDocument, SandpackSourceFormat } from './sandpack-source-types'

export interface SandpackSourceSerializer {
  readonly format: SandpackSourceFormat
  serialize(document: SandpackDocument): string
}
