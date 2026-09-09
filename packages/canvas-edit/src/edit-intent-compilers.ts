import type {
  CanvasDocumentEditIntent
} from './edit-intents'
import type { IntentCompiler } from './edit-compiler-helpers'
import { objectIntentCompilers } from './edit-object-compilers'
import { selectionIntentCompilers } from './edit-selection-compilers'
import { structureIntentCompilers } from './edit-structure-compilers'

export const intentCompilers = {
  ...objectIntentCompilers,
  ...selectionIntentCompilers,
  ...structureIntentCompilers
} satisfies {
  [K in CanvasDocumentEditIntent['kind']]: IntentCompiler<K>
}
