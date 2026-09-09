import { fail, type EditCommand } from './contracts'

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-request', 'JSON 객체가 필요합니다.')
  return value as Record<string, unknown>
}
export function string(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) fail('invalid-request', `${field}: 문자열이 필요합니다.`)
  return value
}
export function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail('invalid-request', 'baseRevision: 양의 정수가 필요합니다.')
  return value
}
export function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10_000) fail('invalid-request', '객체 ID 배열이 필요합니다.')
  return value.map(item => string(item, 'object ID'))
}

type Check = (value: unknown) => boolean
const text: Check = value => typeof value === 'string'
const id: Check = value => typeof value === 'string' && value.length > 0 && value.length <= 256
const number: Check = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9
const boolean: Check = value => typeof value === 'boolean'
const ids: Check = value => Array.isArray(value) && value.length <= 10_000 && value.every(id)
const optional = (check: Check): Check => value => value === undefined || check(value)
const shape = (fields: Record<string, Check>): Check => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const object = value as Record<string, unknown>
  return Object.entries(fields).every(([key, check]) => check(object[key])) && Object.keys(object).every(key => Object.hasOwn(fields, key))
}
const at = shape({ x: number, y: number, w: optional(number), h: optional(number) })
const style = shape({ bg: optional(shape({ color: optional(text) })), stroke: optional(shape({ color: optional(text) })) })
const array = (check: Check): Check => value => Array.isArray(value) && value.length <= 10_000 && value.every(check)
const selection = { nodeIds: ids, edgeIds: ids, groupIds: optional(ids) }
const geometry = { x: number, y: number, width: number, height: number }
const creation = { ...geometry, anchorNodeId: optional(id) }
const commonObject = { id, z: optional(number), locked: optional(boolean), body: optional(text) }
const schemas: Record<EditCommand['kind'], Record<string, Check>> = {
  'replace-object-body': { objectId: id, markdown: text },
  'move-node': { nodeId: id, x: number, y: number },
  'move-nodes': { moves: array(shape({ nodeId: id, x: number, y: number })) },
  'resize-node': { nodeId: id, ...geometry, preserveAutoHeight: optional(boolean) },
  'set-node-style-color': { nodeIds: ids, target: value => value === 'bg' || value === 'stroke', color: text },
  'duplicate-objects': { nodeIds: ids, edgeIds: ids, offsetX: number, offsetY: number },
  'paste-objects': { anchorX: number, anchorY: number, inPlace: boolean, payload: shape({
    origin: value => value === null || shape({ x: number, y: number })(value),
    nodes: array(shape({ ...commonObject, component: id, at, style: optional(style), src: optional(text), alt: optional(text), title: optional(text), lockAspectRatio: optional(boolean) })),
    edges: array(shape({ ...commonObject, from: id, to: id, style: optional(style) })),
    groups: array(shape({ ...commonObject, members: shape({ nodeIds: ids }) }))
  }) },
  'nudge-objects': { nodeIds: ids, dx: number, dy: number },
  'arrange-objects': { ...selection, mode: value => ['bring-forward', 'send-backward', 'bring-to-front', 'send-to-back'].includes(String(value)) },
  'set-objects-locked': { ...selection, locked: boolean },
  'create-note': { ...creation, markdown: text },
  'create-shape': { ...creation, body: text, component: id },
  'create-image': { ...creation, id, src: id, alt: text, title: optional(text), lockAspectRatio: boolean },
  'replace-image-source': { nodeId: id, src: id, alt: text, title: optional(text) },
  'update-image-metadata': { nodeId: id, alt: optional(text), title: optional(text), lockAspectRatio: optional(boolean) },
  'delete-objects': selection,
  'upsert-group': { groupId: id, nodeIds: ids, z: number, locked: optional(boolean) },
  'delete-groups': { groupIds: ids },
  'delete-node': { nodeId: id },
  'update-edge-endpoints': { edgeId: id, from: id, to: id },
  'replace-edge-body': { edgeId: id, markdown: text },
  'create-edge': { from: id, to: id, markdown: text },
  'delete-edge': { edgeId: id },
  'reset-node-height': { nodeId: id }
}

export function command(value: unknown): EditCommand {
  const input = record(value)
  const kind = string(input.kind, 'command.kind')
  if (!Object.hasOwn(schemas, kind)) fail('invalid-request', `지원하지 않는 명령: ${kind}`)
  const fields = schemas[kind as EditCommand['kind']]
  if (!shape({ kind: text, ...fields })(input)) fail('invalid-request', `${kind}: 필드 형식 또는 값이 올바르지 않습니다.`)
  return input as EditCommand
}
