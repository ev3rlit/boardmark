import validate from './board-validator.generated.js'
import type { BoardFile } from './board-file.generated'

export type { BoardFile } from './board-file.generated'
export type BoardItem = BoardFile['items'][number]
export type BoardConnection = BoardFile['connections'][number]
export type BoardError = { code: string; message: string }
export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: BoardError }

export function validateBoard(value: unknown): BoardResult<BoardFile> {
  if (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'boardmark' &&
    'version' in value &&
    Number.isInteger(value.version) &&
    value.version !== 1
  ) {
    return failure(
      'unsupported-version',
      `지원하지 않는 보드 버전 ${value.version}입니다. 버전 1을 지원하는 파일인지 확인하세요.`
    )
  }
  if (!validate(value)) {
    const details = validate.errors
      ?.map(
        (error) => `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params)}`
      )
      .join('\n')
    return failure('invalid-structure', `보드 구조를 확인하세요:\n${details}`)
  }
  const ids = new Set<string>()
  for (const entry of [...value.items, ...value.connections, ...(value.groups ?? [])]) {
    if (ids.has(entry.id))
      return failure(
        'duplicate-id',
        `ID "${entry.id}"가 중복됩니다. 각 항목과 연결선에 고유한 ID를 지정하세요.`
      )
    ids.add(entry.id)
  }
  const itemIds = new Set(value.items.map((item) => item.id))
  const grouped = new Set<string>()
  for (const group of value.groups ?? []) {
    for (const id of group.items) {
      if (!itemIds.has(id))
        return failure('missing-target', `그룹 "${group.id}"의 항목 "${id}"가 없습니다.`)
      if (grouped.has(id))
        return failure('multiple-groups', `항목 "${id}"는 여러 그룹에 속할 수 없습니다.`)
      grouped.add(id)
    }
  }
  for (const edge of value.connections) {
    for (const endpoint of [edge.source, edge.target]) {
      if (!itemIds.has(endpoint))
        return failure('missing-target', `연결선 "${edge.id}"의 대상 "${endpoint}"가 없습니다.`)
    }
  }
  return { ok: true, value }
}

export function parseBoard(source: string): BoardResult<BoardFile> {
  let value: unknown
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ''))
  } catch (error) {
    return failure(
      'invalid-json',
      `JSON 구문을 수정하세요: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return validateBoard(value)
}

export function serializeBoard(value: unknown): BoardResult<string> {
  const result = validateBoard(value)
  if (!result.ok) return result
  // Preserve item, connection and property order; do not sort on save.
  return { ok: true, value: `${JSON.stringify(result.value, null, 2)}\n` }
}

export function emptyBoard(): BoardFile {
  return { format: 'boardmark', version: 1, items: [], connections: [] }
}

function failure(code: string, message: string): BoardResult<never> {
  return { ok: false, error: { code, message } }
}
