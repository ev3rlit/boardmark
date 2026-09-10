import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DocumentSnapshot } from '../../../packages/canvas-api/src/contracts'
import { parseCanvasDocument } from '../../../packages/canvas-parser/src/index'

// A checkout is an immutable proposal base. After applying, checkout to a new path.
type Checkout = {
  format: 'boardmark-checkout-v1'
  checkoutId: string
  api: string
  documentId: string
  nodeId: string
  baseRevision: number
  original: string
}

export function checkoutNode(api: string, doc: DocumentSnapshot, nodeId: string, output: string) {
  const parsed = parseCanvasDocument(doc.markdown)
  if (parsed.isErr()) throw new Error(parsed.error.message)
  const node = parsed.value.ast.nodes.find(node => node.id === nodeId)
  if (!node || node.component !== 'note') throw new Error(`checkout 대상 ${nodeId}는 존재하는 노트여야 합니다.`)
  const file = resolve(output)
  const metadata = `${file}.boardmark-checkout.json`
  if (existsSync(file) || existsSync(metadata)) throw new Error(`checkout 출력이 이미 존재합니다: ${file}`)
  const entry: Checkout = { format: 'boardmark-checkout-v1', checkoutId: randomUUID(), api: api.replace(/\/$/, ''), documentId: doc.id, nodeId, baseRevision: doc.revision, original: node.body ?? '' }
  // Exclusive creation never overwrites an existing draft, even across processes.
  writeFileSync(metadata, JSON.stringify(entry), { flag: 'wx', mode: 0o600 })
  writeFileSync(file, entry.original, { flag: 'wx', mode: 0o600 })
  return { documentId: doc.id, nodeId, baseRevision: doc.revision, file, metadata }
}

export function readWorkingCopy(api: string, documentId: string, nodeId: string, input: string) {
  const file = resolve(input)
  const entry: unknown = JSON.parse(readFileSync(`${file}.boardmark-checkout.json`, 'utf8'))
  if (!entry || typeof entry !== 'object'
    || !('format' in entry) || entry.format !== 'boardmark-checkout-v1'
    || !('checkoutId' in entry) || typeof entry.checkoutId !== 'string' || !entry.checkoutId
    || !('api' in entry) || entry.api !== api.replace(/\/$/, '')
    || !('documentId' in entry) || entry.documentId !== documentId
    || !('nodeId' in entry) || entry.nodeId !== nodeId
    || !('baseRevision' in entry) || typeof entry.baseRevision !== 'number' || !Number.isSafeInteger(entry.baseRevision) || entry.baseRevision < 1
    || !('original' in entry) || typeof entry.original !== 'string') {
    throw new Error('checkout 메타데이터가 잘못되었거나 API·문서·노트가 요청 대상과 다릅니다.')
  }
  const markdown = readFileSync(file, 'utf8')
  const requestId = `checkout-${createHash('sha256').update(JSON.stringify([entry.checkoutId, documentId, nodeId, entry.baseRevision, markdown])).digest('hex')}`
  return { documentId, nodeId, baseRevision: entry.baseRevision, original: entry.original, markdown, changed: markdown !== entry.original, requestId }
}
