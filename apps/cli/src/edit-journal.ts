import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { createApiClient, submitCommand, type ApiConnection } from '../../../packages/canvas-api/src/client'
import { ApiError, type DocumentSnapshot, type EditCommand, type EditRequest } from '../../../packages/canvas-api/src/contracts'

type Entry = {
  version: 1; url: string; documentId: string; session: string; baseRevision: number
  command: EditCommand; request?: EditRequest; result?: DocumentSnapshot
}

// A proposal is written before transmission. Restarting with its request ID
// replays the original session/token/body; it never silently adopts a new base.
export async function submitJournaled(connection: ApiConnection, directory: string, documentId: string, input: {
  requestId: string; baseRevision: number; command: EditCommand; waitMs: number; signal: AbortSignal
}) {
  mkdirSync(directory, { recursive: true })
  const key = createHash('sha256').update(`${connection.url}\n${input.requestId}`).digest('hex')
  const path = resolve(directory, `${key}.json`)
  let entry: Entry = { version: 1, url: connection.url, documentId, session: connection.session, baseRevision: input.baseRevision, command: input.command }
  if (existsSync(path)) {
    entry = JSON.parse(readFileSync(path, 'utf8')) as Entry
    if (entry.version !== 1 || entry.url !== connection.url || entry.documentId !== documentId || entry.baseRevision !== input.baseRevision || JSON.stringify(entry.command) !== JSON.stringify(input.command)) {
      throw new ApiError({ code: 'request-reused', message: '이 요청 ID의 저장된 수정안과 입력이 다릅니다. 재계산한 수정안에는 새 요청 ID를 사용하세요.', retryable: false }, 409)
    }
  } else write(entry, true)
  const client = createApiClient({ ...connection, session: entry.session })
  if (entry.result) return entry.result
  if (entry.request) {
    try {
      entry.result = await client.edit(documentId, entry.request)
      write(entry)
      return entry.result
    } catch (error) {
      // This response proves no commit record exists for the exact request.
      // Reacquisition must still validate the ORIGINAL proposal's base.
      if (!(error instanceof ApiError) || error.data.code !== 'lease-expired') throw error
    }
  }
  const result = await submitCommand(client, documentId, {
    ...input, prepared(request) { entry.request = request; write(entry) }
  })
  entry.result = result
  write(entry)
  return result

  function write(value: Entry, initial = false) {
    const target = initial ? path : `${path}.${randomUUID()}.tmp`
    const descriptor = openSync(target, 'wx', 0o600)
    try { writeFileSync(descriptor, JSON.stringify(value)); fsyncSync(descriptor) }
    finally { closeSync(descriptor) }
    if (!initial) renameSync(target, path)
  }
}
