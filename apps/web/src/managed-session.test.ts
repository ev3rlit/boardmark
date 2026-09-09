import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transferableAbortController } from 'node:util'
import { waitFor } from '@testing-library/react'
import { BoardDatabase } from '../../server/src/database'
import { createApiServer } from '../../server/src/http'
import { createManagedSession } from './managed-session'
import { createApiClient, submitCommand } from '../../../packages/canvas-api/src/client'

const dispose: Array<() => Promise<void>> = []
// Native fetch uses Node's signal; the UI continues to run in jsdom.
beforeEach(() => { vi.stubGlobal('AbortSignal', transferableAbortController().signal.constructor) })
afterEach(async () => { for (const cleanup of dispose.splice(0)) await cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const source = '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\nA\n:::\n\n::: note {"id":"b","at":{"x":300,"y":0}}\nB\n:::\n'

async function setup() {
  const db = new BoardDatabase(':memory:')
  const server = createApiServer({ database: db, token: 'test-token', origins: [] })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('서버 주소가 없습니다.')
  const connection = { url: `http://127.0.0.1:${address.port}/api`, token: 'test-token', session: 'web-session-test-1234' }
  const web = createManagedSession(connection)
  dispose.push(async () => { web.dispose(); await new Promise<void>(resolve => server.close(() => { db.close(); resolve() })) })
  const ai = createApiClient({ ...connection, session: 'ai-session-test-1234' })
  const doc = await ai.create({ requestId: 'setup', name: '통합', markdown: source })
  await web.open(doc)
  return { web, ai, doc }
}

describe('웹 DB 세션', () => {
  it('정상 드래그 승인 대기는 저장 상태와 오류 안내를 깜빡이지 않는다', async () => {
    const { web } = await setup()
    const fetch = globalThis.fetch
    let approve!: () => void
    const gate = new Promise<void>(resolve => { approve = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).endsWith('/acquire')) await gate
      return response
    })
    const before = web.status.getState()
    const acquiring = web.begin(['a'])
    try {
      expect(web.status.getState()).toBe(before)
    } finally { approve(); await acquiring }
    expect(web.status.getState()).toBe(before)
    await web.release()
  })

  it('다른 작성자가 점유한 드래그 대상은 구체적인 실패 안내를 유지한다', async () => {
    const { web, ai, doc } = await setup()
    const lease = await ai.acquire(doc.id, { objects: ['a'], baseRevision: doc.revision })
    expect(await web.begin(['a'])).toBe(false)
    expect(web.status.getState()).toMatchObject({ status: 'failed', message: expect.stringContaining('편집 중') })
    await ai.release(doc.id, lease.token)
  })

  it('복구 대기 중 다른 노트 편집이나 이동이 보존된 초안을 대체하지 않는다', async () => {
    const { web } = await setup()
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.store.getState().editingState.status).toBe('active'))
    web.store.getState().updateEditingMarkdown('복구할 원래 초안')
    const recovery = web.status.getState().recovery
    // A refreshed client has the recovery record but no mounted editor.
    web.store.setState({ editingState: { status: 'idle' } })
    await web.release()
    web.store.getState().startObjectEditing('b')
    await waitFor(() => expect(web.status.getState().status).toBe('failed'))
    await web.store.getState().commitNodeMove('b', 400, 400)
    expect(web.store.getState().editingState.status).toBe('idle')
    expect(web.status.getState().recovery).toEqual(recovery)
    await web.archiveDraft()
    expect(web.status.getState().recovery).toBeNull()
    expect(Object.keys(localStorage).some(key => key.includes(':archive:') && localStorage.getItem(key)?.includes('복구할 원래 초안'))).toBe(true)
    web.store.getState().startObjectEditing('b')
    await waitFor(() => expect(web.store.getState().editingState.status).toBe('active'))
  })

  it('Undo 응답이 유실되어도 같은 역변경을 복구하며 중복 버전을 만들지 않는다', async () => {
    const { web, ai, doc } = await setup()
    await web.store.getState().commitNodeMove('a', 80, 90)
    const fetch = globalThis.fetch
    let lost = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).endsWith('/revert') && lost++ < 2) throw new TypeError('Undo 응답 유실')
      return response
    })
    await web.store.getState().undo()
    expect(web.status.getState()).toMatchObject({ status: 'offline', recovery: { revert: { revision: 2 } } })
    expect((await ai.read(doc.id)).revision).toBe(3)
    await web.restoreDraft()
    expect(web.status.getState()).toMatchObject({ status: 'saved', recovery: null })
    expect((await ai.read(doc.id)).revision).toBe(3)
    expect(web.store.getState().nodes.find(node => node.id === 'a')?.at.x).toBe(0)
  })

  it('대기 중 Escape는 초안을 남기고 늦게 도착한 승인으로 편집기를 열지 않는다', async () => {
    const { web, ai, doc } = await setup()
    const fetch = globalThis.fetch
    let allow: (() => void) | undefined
    const gate = new Promise<void>(resolve => { allow = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).endsWith('/acquire')) await gate
      return response
    })
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.status.getState().preparing?.id).toBe('a'))
    web.updatePreparingText('취소 후 보존')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    allow!()
    await waitFor(async () => expect(await ai.presence(doc.id)).toEqual([]))
    expect(web.store.getState().editingState.status).toBe('idle')
    expect(web.status.getState().recovery?.preparing?.text).toBe('취소 후 보존')
  })

  it('편집권 응답 대기 중 입력을 보존하고 승인 후 노트 끝에 반영한다', async () => {
    const { web, ai, doc } = await setup()
    const fetch = globalThis.fetch
    let allow: (() => void) | undefined
    const gate = new Promise<void>(resolve => { allow = resolve })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).endsWith('/acquire')) await gate
      return response
    })
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.status.getState().preparing?.id).toBe('a'))
    web.updatePreparingText('추가입력')
    expect(web.store.getState().editingState.status).toBe('idle')
    expect(web.status.getState().recovery?.preparing?.text).toBe('추가입력')
    allow!()
    await waitFor(() => expect(web.store.getState().editingState).toMatchObject({ status: 'active', draftMarkdown: 'A추가입력' }))
    expect(await web.store.getState().commitInlineEditing()).toBe(true)
    expect((await ai.read(doc.id)).markdown).toContain('A추가입력')
  })

  it('저장은 성공하고 응답만 유실되어도 초안을 보존하고 같은 요청을 한 번만 복구한다', async () => {
    const { web, ai, doc } = await setup()
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.store.getState().editingState.status).toBe('active'))
    web.store.getState().updateEditingMarkdown('응답 유실 전송')
    const fetch = globalThis.fetch
    let lost = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await fetch(input, init)
      if (String(input).endsWith('/edit') && lost++ < 2) throw new TypeError('응답 유실')
      return response
    })
    expect(await web.store.getState().commitInlineEditing()).toBe(false)
    expect(web.status.getState()).toMatchObject({ status: 'offline', recovery: { request: { baseRevision: 1 } } })
    expect((await ai.read(doc.id)).revision).toBe(2)
    await web.restoreDraft()
    expect(web.status.getState()).toMatchObject({ status: 'saved', recovery: null })
    expect((await ai.read(doc.id)).revision).toBe(2)
  })

  it('승인 전에 편집기를 열지 않고 다른 세션은 같은 노트에 진입하지 못한다', async () => {
    const { web, ai, doc } = await setup()
    const lease = await ai.acquire(doc.id, { objects: ['a'], baseRevision: 1 })
    web.store.getState().startObjectEditing('a')
    expect(web.store.getState().editingState.status).toBe('idle')
    await waitFor(() => expect(web.status.getState().status).toBe('failed'))
    expect(web.store.getState().editingState.status).toBe('idle')
    await ai.release(doc.id, lease.token)
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.store.getState().editingState.status).toBe('active'))
    await expect(ai.acquire(doc.id, { objects: ['a'], baseRevision: 1 })).rejects.toMatchObject({ data: { code: 'locked' } })
  })

  it('독립 변경 재동기화는 활성 초안·선택·카메라를 유지하고 완료 뒤 DB에 함께 저장한다', async () => {
    const { web, ai, doc } = await setup()
    web.store.getState().setViewport({ x: 100, y: 120, zoom: 1.2 })
    web.store.getState().setPrimarySelectedNode('a')
    web.store.getState().startObjectEditing('a')
    await waitFor(() => expect(web.store.getState().editingState.status).toBe('active'))
    web.store.getState().updateEditingMarkdown('웹 초안')
    await submitCommand(ai, doc.id, { requestId: 'ai', baseRevision: 1, command: { kind: 'replace-object-body', objectId: 'b', markdown: 'AI 변경' } })
    await web.sync()
    expect(web.store.getState().editingState).toMatchObject({ status: 'active', draftMarkdown: '웹 초안' })
    expect(web.store.getState().viewport).toEqual({ x: 100, y: 120, zoom: 1.2 })
    expect(web.store.getState().selectedNodeIds).toEqual(['a'])
    expect(await web.store.getState().commitInlineEditing()).toBe(true)
    const saved = await ai.read(doc.id)
    expect(saved.markdown).toContain('웹 초안')
    expect(saved.markdown).toContain('AI 변경')
    expect(web.store.getState().editingState.status).toBe('idle')
  })
})
