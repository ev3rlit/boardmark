// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { createApiServer } from './http'
import { BoardDatabase } from './database'
import { createApiClient, submitCommand } from '../../../packages/canvas-api/src/client'

const disposals: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of disposals.splice(0)) await dispose() })

async function setup() {
  const database = new BoardDatabase(':memory:')
  const server = createApiServer({ database, token: 'test-secret', origins: ['http://localhost:5173'] })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('서버 주소 없음')
  const url = `http://127.0.0.1:${address.port}/api`
  disposals.push(() => new Promise(resolve => server.close(() => { database.close(); resolve() })))
  return { url, web: createApiClient({ url, token: 'test-secret', session: 'web-session-123456' }), ai: createApiClient({ url, token: 'test-secret', session: 'ai-session-1234567' }) }
}

describe('HTTP 공통 API', () => {
  it('대기는 시간 제한·취소를 지키고 기다리는 동안 바뀐 대상의 예전 기준을 거절한다', async () => {
    const { web, ai } = await setup()
    const doc = await web.create({ requestId: 'new', name: '대기', markdown: '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\nA\n:::\n' })
    const lease = await web.acquire(doc.id, { objects: ['a'], baseRevision: 1 })
    const proposal = { requestId: 'wait', baseRevision: 1, command: { kind: 'replace-object-body' as const, objectId: 'a', markdown: '예전 제안' } }
    await expect(submitCommand(ai, doc.id, { ...proposal, waitMs: 20 })).rejects.toMatchObject({ data: { code: 'locked' } })
    const controller = new AbortController()
    const cancellation = setTimeout(() => controller.abort(new Error('사용자 취소')), 50)
    await expect(submitCommand(ai, doc.id, { ...proposal, waitMs: 5000, signal: controller.signal })).rejects.toThrow(/취소/)
    clearTimeout(cancellation)
    const changed = (async () => {
      await new Promise(resolve => setTimeout(resolve, 50))
      await web.edit(doc.id, { ...proposal, requestId: 'web', leaseToken: lease.token, command: { ...proposal.command, markdown: '새 원문' } })
      await web.release(doc.id, lease.token)
    })()
    await expect(submitCommand(ai, doc.id, { ...proposal, waitMs: 2000 })).rejects.toMatchObject({ data: { code: 'stale-base' } })
    await changed
    expect((await ai.read(doc.id)).markdown).toContain('새 원문')
    expect(await web.presence(doc.id)).toEqual([])
  })

  it('실제 HTTP에서 웹 편집 중 AI 덮어쓰기를 막고 독립 변경을 전달한다', async () => {
    const { web, ai } = await setup()
    const doc = await web.create({ requestId: 'import', name: '공통 보드', markdown: '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\nA\n:::\n\n::: note {"id":"b","at":{"x":300,"y":0}}\nB\n:::\n' })
    const lease = await web.acquire(doc.id, { objects: ['a'], baseRevision: doc.revision })
    await expect(submitCommand(ai, doc.id, { requestId: 'blocked', baseRevision: 1, command: { kind: 'replace-object-body', objectId: 'a', markdown: '충돌' } })).rejects.toMatchObject({ data: { code: 'locked' } })
    const fromAi = await submitCommand(ai, doc.id, { requestId: 'independent', baseRevision: 1, command: { kind: 'replace-object-body', objectId: 'b', markdown: 'AI' } })
    expect(fromAi.revision).toBe(2)
    await web.edit(doc.id, { requestId: 'web', baseRevision: 1, leaseToken: lease.token, command: { kind: 'replace-object-body', objectId: 'a', markdown: '웹' } })
    expect((await ai.read(doc.id)).markdown).toContain('웹\n:::')
    expect((await web.read(doc.id)).markdown).toContain('AI\n:::')
  })

  it('인증·Origin·명령 형태를 서버에서 검사한다', async () => {
    const { url } = await setup()
    expect((await fetch(`${url}/documents`)).status).toBe(401)
    expect((await fetch(`${url}/documents`, { headers: { Origin: 'https://unexpected.example', Authorization: 'Bearer test-secret', 'X-Boardmark-Session': 'valid-session-1234' } })).status).toBe(401)
    const response = await fetch(`${url}/documents/missing/edit`, { method: 'POST', headers: { Authorization: 'Bearer test-secret', 'X-Boardmark-Session': 'valid-session-1234', 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: 'x', baseRevision: 1, leaseToken: 'x', command: { kind: 'move-node', nodeId: 'a', x: 'bad', y: 1 } }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'invalid-request' } })
  })
})
