import type { CanvasDocumentRecord } from '@boardmark/canvas-repository'
import type { Result } from 'neverthrow'
import {
  type CanvasDocumentEditError,
  type CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import type {
  CanvasDocumentEditCompilerContext,
  IntentCompiler
} from '@canvas-app/services/edit-compiler-helpers'
import { intentCompilers } from '@canvas-app/services/edit-intent-compilers'
import type { CanvasEditTransaction } from '@canvas-app/services/edit-transaction'

export type { CanvasDocumentEditError, CanvasDocumentEditIntent } from '@canvas-app/services/edit-intents'

export type CanvasDocumentEditService = {
  compileTransaction: (
    source: string,
    record: CanvasDocumentRecord,
    intent: CanvasDocumentEditIntent
  ) => Result<CanvasEditTransaction, CanvasDocumentEditError>
}

export function createCanvasDocumentEditService(): CanvasDocumentEditService {
  return {
    compileTransaction(source, record, intent) {
      return compileIntent(
        {
          record,
          source
        },
        intent
      )
    }
  }
}

function compileIntent<K extends CanvasDocumentEditIntent['kind']>(
  context: CanvasDocumentEditCompilerContext,
  intent: Extract<CanvasDocumentEditIntent, { kind: K }>
) {
  const compiler = readIntentCompiler(intent.kind)
  return compiler(context, intent)
}

function readIntentCompiler<K extends CanvasDocumentEditIntent['kind']>(kind: K): IntentCompiler<K> {
  return intentCompilers[kind] as unknown as IntentCompiler<K>
}
