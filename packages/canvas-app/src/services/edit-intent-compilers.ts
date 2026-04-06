import type {
  CanvasDocumentEditIntent
} from '@canvas-app/services/edit-intents'
import type { IntentCompiler } from '@canvas-app/services/edit-compiler-helpers'
import { objectIntentCompilers } from '@canvas-app/services/edit-object-compilers'
import { selectionIntentCompilers } from '@canvas-app/services/edit-selection-compilers'
import { structureIntentCompilers } from '@canvas-app/services/edit-structure-compilers'

export const intentCompilers = {
  ...objectIntentCompilers,
  ...selectionIntentCompilers,
  ...structureIntentCompilers
} satisfies {
  [K in CanvasDocumentEditIntent['kind']]: IntentCompiler<K>
}
