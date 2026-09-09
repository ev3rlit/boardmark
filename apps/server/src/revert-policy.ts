import type { DocumentSnapshot } from '../../../packages/canvas-api/src/contracts'
import { fail } from '../../../packages/canvas-api/src/contracts'
import { objectSignatures, readEditableRecord } from './edit-policy'

// Restore only the objects changed by one committed operation. The caller checks
// intervening object revisions and active editors in the same DB transaction.
export function prepareRevert(current: DocumentSnapshot, before: DocumentSnapshot, after: DocumentSnapshot) {
  const previous = readEditableRecord(before)
  const committed = readEditableRecord(after)
  const latest = readEditableRecord(current)
  const oldSignatures = objectSignatures(previous)
  const newSignatures = objectSignatures(committed)
  const affected = [...new Set([...oldSignatures.keys(), ...newSignatures.keys()])]
    .filter(id => oldSignatures.get(id) !== newSignatures.get(id))
  const objects = (record: typeof previous) => new Map([...record.ast.nodes, ...record.ast.edges, ...record.ast.groups].map(object => [object.id, object]))
  const oldObjects = objects(previous), newObjects = objects(committed), currentObjects = objects(latest)
  const edits: Array<{ start: number; end: number; text: string }> = []
  const inserts: string[] = []
  for (const id of affected) {
    const old = oldObjects.get(id), next = newObjects.get(id), present = currentObjects.get(id)
    const slice = (doc: DocumentSnapshot, object: NonNullable<typeof old>) => doc.markdown.slice(object.sourceMap.objectRange.start.offset, object.sourceMap.objectRange.end.offset)
    const oldText = old ? slice(before, old) : undefined
    const newText = next ? slice(after, next) : undefined
    if (oldText === newText) continue // relationship-only dependency
    if (next && !present) fail('stale-base', `되돌릴 객체 ${id}가 삭제되었습니다.`)
    if (!next && present) fail('stale-base', `복원할 ID ${id}가 이미 사용 중입니다.`)
    if (present) edits.push({ start: present.sourceMap.objectRange.start.offset, end: present.sourceMap.objectRange.end.offset, text: oldText ?? '' })
    else if (oldText) inserts.push(oldText)
  }
  let markdown = current.markdown
  for (const edit of edits.sort((a, b) => b.start - a.start)) markdown = markdown.slice(0, edit.start) + edit.text + markdown.slice(edit.end)
  if (inserts.length) markdown += `\n\n${inserts.join('\n\n')}\n`
  readEditableRecord({ ...current, markdown })
  return { markdown, affected }
}
