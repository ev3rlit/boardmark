import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { ApiError, fail } from '../../../packages/canvas-api/src/contracts'
import { command, record, revision, string, strings } from '../../../packages/canvas-api/src/validation'
import { BoardDatabase } from './database'

type ServerOptions = { database: BoardDatabase; token: string; origins: string[] }
const maxBytes = 20 * 1024 * 1024

export function createApiServer({ database, token, origins }: ServerOptions) {
  const waiting = new Map<string, Set<() => void>>()
  function waitForChange(id: string, response: ServerResponse) {
    return new Promise<void>(resolve => {
      const listeners = waiting.get(id) ?? new Set<() => void>()
      const finish = () => {
        clearTimeout(timer)
        response.off('close', finish)
        listeners.delete(finish)
        if (!listeners.size) waiting.delete(id)
        resolve()
      }
      // Also refresh lease expiry/presence at the existing polling cadence.
      const timer = setTimeout(finish, 1500)
      listeners.add(finish)
      waiting.set(id, listeners)
      response.once('close', finish)
    })
  }
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      const origin = request.headers.origin
      if (origin && !origins.includes(origin)) fail('unauthorized', '허용되지 않은 웹 Origin입니다.')
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin)
        response.setHeader('Vary', 'Origin')
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Boardmark-Session')
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        response.writeHead(204).end()
        return
      }
      const authorization = Buffer.from(request.headers.authorization ?? '')
      const expected = Buffer.from(`Bearer ${token}`)
      if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) fail('unauthorized', 'API 접근 토큰을 확인하세요.')
      const session = string(request.headers['x-boardmark-session'], 'X-Boardmark-Session')
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(session)) fail('invalid-request', '세션 ID는 16~128자의 임의 문자열이어야 합니다.')
      const url = new URL(request.url ?? '/', 'http://localhost')
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (parts[0] !== 'api') fail('not-found', 'API 경로가 없습니다.')
      let result: unknown
      if (request.method === 'GET') {
        if (parts.length === 2 && parts[1] === 'documents') result = database.list()
        else if (parts[1] === 'documents' && parts.length === 3) result = database.read(parts[2])
        else if (parts[1] === 'documents' && parts[3] === 'presence') result = database.owners(parts[2])
        else if (parts[1] === 'documents' && parts[3] === 'changes') {
          const current = database.changes(parts[2])
          const after = url.searchParams.get('after')
          if (after !== null && revision(Number(after)) === current.revision) {
            await waitForChange(parts[2], response)
            if (response.destroyed) return
            result = database.changes(parts[2])
          } else result = current
        }
        else if (parts[1] === 'documents' && parts[3] === 'attachments') result = database.attachments(parts[2])
        else if (parts[1] === 'documents' && parts[3] === 'bundle') result = database.bundle(parts[2])
        else if (parts[1] === 'assets' && parts.length === 3) {
          const asset = database.asset(parts[2])
          result = { mime: asset.mime, base64: Buffer.from(asset.bytes).toString('base64') }
        } else fail('not-found', '조회 경로가 없습니다.')
      } else if (request.method === 'POST') {
        const input = record(await readJson(request))
        if (parts[1] === 'documents' && parts.length === 2) {
          result = database.create(session, {
            requestId: string(input.requestId, 'requestId'), name: string(input.name, 'name'),
            markdown: string(input.markdown, 'markdown', true),
            assets: input.assets === undefined ? undefined : readAssets(input.assets)
          })
        } else if (parts[1] === 'assets' && parts.length === 2) {
          const encoded = string(input.base64, 'base64')
          if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail('invalid-request', '첨부 데이터가 base64 형식이 아닙니다.')
          result = database.putAsset(Buffer.from(encoded, 'base64'), string(input.mime, 'mime'))
        } else if (parts[1] === 'documents' && parts.length === 4) {
          const id = parts[2]
          switch (parts[3]) {
            case 'plan': result = database.plan(id, command(input.command)); break
            case 'revert': result = database.revert(id, session, { requestId: string(input.requestId, 'requestId'), revision: revision(input.revision) }); break
            case 'acquire': result = database.acquire(id, session, { objects: strings(input.objects), baseRevision: revision(input.baseRevision) }); break
            case 'renew': result = database.renew(id, session, string(input.leaseToken, 'leaseToken')); break
            case 'release': database.release(id, session, string(input.leaseToken, 'leaseToken')); result = { released: true }; break
            case 'edit': result = database.edit(id, session, { requestId: string(input.requestId, 'requestId'), baseRevision: revision(input.baseRevision), leaseToken: string(input.leaseToken, 'leaseToken'), command: command(input.command) }); break
            case 'rename': result = database.rename(id, session, { requestId: string(input.requestId, 'requestId'), baseRevision: revision(input.baseRevision), name: string(input.name, 'name') }); break
            case 'replace': result = database.replace(id, session, { requestId: string(input.requestId, 'requestId'), baseRevision: revision(input.baseRevision), leaseToken: string(input.leaseToken, 'leaseToken'), markdown: string(input.markdown, 'markdown', true) }); break
            case 'delete': result = database.delete(id, session, { requestId: string(input.requestId, 'requestId'), baseRevision: revision(input.baseRevision), leaseToken: string(input.leaseToken, 'leaseToken') }); break
            default: fail('not-found', '변경 경로가 없습니다.')
          }
          // Database calls above return only after commit. Failed mutations never
          // wake readers, and readers re-read the latest committed revision.
          if (['edit', 'replace', 'rename', 'revert', 'delete'].includes(parts[3])) {
            for (const finish of waiting.get(id) ?? []) finish()
          }
        } else fail('not-found', '변경 경로가 없습니다.')
      } else fail('invalid-request', '지원하지 않는 HTTP 메서드입니다.')
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify({ ok: true, value: result }))
    } catch (error) {
      const known = error instanceof ApiError
      if (!known) console.error('API 처리 실패:', error)
      response.writeHead(known ? error.status : 500, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({ ok: false, error: known ? error.data : { code: 'internal-error', message: '서버 처리에 실패했습니다. 같은 요청 ID로 결과를 확인하세요.', retryable: true } }))
    }
  })
}

function readAssets(value: unknown) {
  if (!Array.isArray(value) || value.length > 1000) fail('invalid-request', 'assets는 1000개 이하의 첨부 배열이어야 합니다.')
  return value.map(entry => {
    const asset = record(entry)
    const base64 = string(asset.base64, 'asset.base64', true)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) fail('invalid-request', '첨부 base64가 올바르지 않습니다.')
    return { path: string(asset.path, 'asset.path'), mime: string(asset.mime, 'asset.mime'), base64 }
  })
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) fail('invalid-request', 'Content-Type: application/json이 필요합니다.')
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    length += bytes.length
    if (length > maxBytes) fail('invalid-request', '요청이 20 MiB 제한을 초과했습니다.')
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { fail('invalid-request', '올바른 JSON을 보내세요.') }
}
