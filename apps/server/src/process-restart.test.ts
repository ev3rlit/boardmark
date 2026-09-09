// @vitest-environment node
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { createApiClient } from '../../../packages/canvas-api/src/client'

it('저장 요청 중 프로세스를 강제 종료해도 원문·이력·처리 기록이 함께 확정되거나 함께 미확정이다', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'boardmark-crash-'))
  const reserved = createServer()
  await new Promise<void>(resolve => reserved.listen(0, '127.0.0.1', resolve))
  const address = reserved.address()
  if (!address || typeof address === 'string') throw new Error('포트 없음')
  const port = address.port
  await new Promise<void>(resolve => reserved.close(() => resolve()))
  const token = 'process-restart-test-token-1234567890'
  const launch = async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('apps/server/src/main.ts')], {
      env: { ...process.env, BOARDMARK_DATA_DIR: directory, BOARDMARK_PORT: String(port), BOARDMARK_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    })
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('API 시작 시간 초과')) }, 10_000)
      child.stdout.on('data', data => { if (String(data).includes('Boardmark API:')) { clearTimeout(timeout); resolve() } })
      child.once('error', reject)
      child.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`API 시작 실패: ${code}`)) })
    })
    return child
  }
  let child = await launch()
  const client = createApiClient({ url: `http://127.0.0.1:${port}/api`, token, session: 'crash-session-123456' })
  try {
    const doc = await client.create({ requestId: 'create', name: '충돌 복구', markdown: '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\n기존\n:::\n' })
    const lease = await client.acquire(doc.id, { baseRevision: 1, objects: ['a'] })
    const request = { requestId: 'crash-edit', baseRevision: 1, leaseToken: lease.token, command: { kind: 'replace-object-body' as const, objectId: 'a', markdown: '저장 중 강제 종료 검증 '.repeat(80_000) } }
    const pending = client.edit(doc.id, request).catch(() => null)
    const exited = once(child, 'exit')
    setTimeout(() => child.kill('SIGKILL'), 15)
    await exited
    await pending
    child = await launch()
    const recovered = await client.read(doc.id)
    expect([1, 2]).toContain(recovered.revision)
    const replay = await client.edit(doc.id, request).catch(error => error)
    if (recovered.revision === 2) expect(replay).toEqual(recovered)
    else expect(replay).toMatchObject({ data: { code: 'lease-expired' } })
    const db = new DatabaseSync(join(directory, 'boardmark.sqlite'), { readOnly: true })
    try {
      expect(db.prepare('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
      expect(db.prepare('SELECT MAX(revision) AS revision FROM history WHERE document_id=?').get(doc.id)?.revision).toBe(recovered.revision)
      expect(db.prepare('SELECT COUNT(*) AS count FROM requests WHERE request_id=?').get(request.requestId)?.count).toBe(recovered.revision === 2 ? 1 : 0)
    } finally { db.close() }
  } finally {
    const exited = once(child, 'exit')
    child.kill('SIGKILL')
    await exited
  }
}, 30_000)
