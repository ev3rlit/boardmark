import { createCanvasMarkdownDocumentRepository, type CanvasDocumentRecord } from '../../../packages/canvas-repository/src/index'
import { createCanvasDocumentEditService, createCanvasEditTransactionResolver, applyResolvedTransaction } from '../../../packages/canvas-edit/src/index'
import { fail, type DocumentSnapshot, type EditCommand } from '../../../packages/canvas-api/src/contracts'

export function readEditableRecord(doc: DocumentSnapshot): CanvasDocumentRecord {
  const result = createCanvasMarkdownDocumentRepository().readSource({
    locator: { kind: 'memory', key: doc.id, name: doc.name }, source: doc.markdown, isTemplate: false
  })
  if (result.isErr()) fail('invalid-document', result.error.message)
  const record = result.value
  if (record.issues.length) fail('invalid-document', '문서의 경고를 해결한 뒤 객체를 편집하세요.', record.issues)
  const ids = new Set<string>()
  for (const object of [...record.ast.nodes, ...record.ast.edges, ...record.ast.groups]) {
    if (['*', '@create'].includes(object.id) || ids.has(object.id)) fail('invalid-document', `중복되거나 예약된 객체 ID: ${object.id}`)
    ids.add(object.id)
  }
  const nodes = new Set(record.ast.nodes.map(node => node.id))
  for (const group of record.ast.groups) {
    if (group.members.nodeIds.some(id => !nodes.has(id))) fail('invalid-document', `그룹 ${group.id}가 없는 노드를 참조합니다.`)
  }
  return record
}

// Source text and relationship identity are derived from Markdown, never an
// independent editable model. Offsets are deliberately absent from fingerprints.
export function objectSignatures(record: CanvasDocumentRecord): Map<string, string> {
  const result = new Map<string, string>()
  for (const object of [...record.ast.nodes, ...record.ast.edges, ...record.ast.groups]) {
    const range = object.sourceMap.objectRange
    const edges = record.ast.edges.filter(edge => edge.from === object.id || edge.to === object.id)
      .map(edge => [edge.id, edge.from, edge.to]).sort()
    const groups = record.ast.groups.filter(group => group.members.nodeIds.includes(object.id))
      .map(group => [group.id, [...group.members.nodeIds].sort()]).sort()
    result.set(object.id, JSON.stringify([record.source.slice(range.start.offset, range.end.offset), edges, groups]))
  }
  return result
}

export function prepareEdit(doc: DocumentSnapshot, command: EditCommand) {
  const record = readEditableRecord(doc)
  const compiled = createCanvasDocumentEditService().compileTransaction(doc.markdown, record, command)
  if (compiled.isErr()) fail('invalid-request', compiled.error.message)
  const targets = new Set<string>()
  for (const edit of compiled.value.edits) {
    if (edit.anchor.kind !== 'document-end') targets.add(edit.anchor.objectId)
    if (edit.anchor.kind === 'document-end' || edit.anchor.kind === 'after-object') targets.add('@create')
  }
  // Compiler anchors include writes; add the read dependencies it does not modify.
  if ('anchorNodeId' in command && command.anchorNodeId) targets.add(command.anchorNodeId)
  if ('from' in command) { targets.add(command.from); targets.add(command.to) }
  if (command.kind === 'upsert-group') {
    command.nodeIds.forEach(id => targets.add(id))
    const previous = record.ast.groups.find(group => group.id === command.groupId)
    previous?.members.nodeIds.forEach(id => targets.add(id))
  }
  if (command.kind === 'duplicate-objects') {
    command.nodeIds.forEach(id => targets.add(id))
    command.edgeIds.forEach(id => targets.add(id))
  }
  if (command.kind === 'arrange-objects') {
    for (const id of objectSignatures(record).keys()) targets.add(id)
  }
  // Relationships being modified protect both endpoints and group members.
  for (const edge of record.ast.edges) {
    if (targets.has(edge.id)) { targets.add(edge.from); targets.add(edge.to) }
  }
  for (const group of record.ast.groups) {
    if (targets.has(group.id)) group.members.nodeIds.forEach(id => targets.add(id))
  }
  const resolved = createCanvasEditTransactionResolver().resolve(compiled.value)
  if (resolved.isErr()) fail('invalid-request', resolved.error.message)
  const applied = applyResolvedTransaction({
    documentRepository: createCanvasMarkdownDocumentRepository(), record,
    resolved: resolved.value, source: doc.markdown
  })
  if ('error' in applied) fail('invalid-request', applied.error.message)
  const nextRecord = readEditableRecord({ ...doc, markdown: applied.source })
  const before = objectSignatures(record)
  const after = objectSignatures(nextRecord)
  // Also derive relationship effects from the result. Clipboard payloads can
  // reference existing nodes even when the compiler only appends new objects.
  for (const [id, signature] of before) if (after.get(id) !== signature) targets.add(id)
  const objects = [...record.ast.nodes, ...record.ast.edges, ...record.ast.groups]
  for (const id of targets) {
    if (id === '@create') continue
    const object = objects.find(object => object.id === id)
    if (!object) fail('not-found', `편집 대상 ${id}를 찾을 수 없습니다.`)
    if (object.locked && command.kind !== 'set-objects-locked') fail('locked', `객체 ${id}의 문서 속성 잠금이 설정되어 있습니다.`)
  }
  // A body cannot inject new directives or remove other objects.
  if (command.kind === 'replace-object-body' || command.kind === 'replace-edge-body') {
    const id = command.kind === 'replace-object-body' ? command.objectId : command.edgeId
    if (before.size !== after.size || [...before].some(([key, value]) => key !== id && after.get(key) !== value)) {
      fail('invalid-request', '본문 변경이 객체 경계를 벗어납니다. 본문 안의 ::: 줄을 확인하세요.')
    }
  }
  return { targets: [...targets].sort(), markdown: applied.source, record, before, after }
}
