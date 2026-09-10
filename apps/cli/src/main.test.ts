// @vitest-environment node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BoardDatabase } from '../../server/src/database'
import { createApiServer } from '../../server/src/http'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })
async function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'boardmark-cli-'))
  const db = new BoardDatabase(join(directory, 'test.sqlite'))
  const server = createApiServer({ database: db, token: 'cli-test-token', origins: [] })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(() => new Promise(resolve => server.close(() => { db.close(); resolve() })))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('주소 없음')
  const port = address.port
  async function cli(...args: string[]) {
    try {
      const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', resolve('apps/cli/src/main.ts'), ...args, '--json', '--api', `http://127.0.0.1:${port}/api`, '--journal-dir', join(directory, 'requests')], {
        env: { ...process.env, BOARDMARK_TOKEN: 'cli-test-token' }
      })
      return { code: 0, data: JSON.parse(result.stdout) }
    } catch (error) {
      const failed = error as { code: number; stdout: string }
      return { code: failed.code, data: JSON.parse(failed.stdout) }
    }
  }
  return { directory, db, cli }
}
describe('별도 CLI 프로세스와 실제 DB', () => {
  it('작업 파일의 대상 검증, 무변경, 동시 편집, 충돌과 동일 apply 재실행을 처리한다', async () => {
    const { directory, db, cli } = await setup()
    const source = join(directory, 'source.md')
    writeFileSync(source, '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\nA\n:::\n\n::: note {"id":"b","at":{"x":400,"y":0}}\nB\n:::\n')
    const imported = await cli('document', 'import', '--input', source)
    const id = imported.data.value.id
    const draft = join(directory, 'draft.md')
    const args = ['apply', id, '--node', 'a', '--input', draft]
    expect((await cli('checkout', id, '--node', 'a', '--output', draft)).code).toBe(0)
    expect((await cli('checkout', id, '--node', 'a', '--output', draft)).code).toBe(2)
    expect((await cli(...args)).data.value.changed).toBe(false)
    expect(db.read(id).revision).toBe(1)
    writeFileSync(draft, 'AI first\nAI second\n')
    expect((await cli('apply', 'wrong-document', '--node', 'a', '--input', draft)).code).toBe(2)
    expect((await cli('apply', id, '--node', 'b', '--input', draft)).code).toBe(2)
    expect((await cli(...args, '--base-revision', '99')).code).toBe(2)
    const diff = await cli('diff', id, '--node', 'a', '--input', draft)
    expect(diff.data.value.after).toBe('AI first\nAI second\n')
    expect(diff.data.value.changed).toBe(true)
    expect(db.read(id).revision).toBe(1)
    const other = join(directory, 'other.md')
    writeFileSync(other, 'B changed')
    expect((await cli('node', 'update', id, 'b', '--body-file', other, '--base-revision', '1')).code).toBe(0)
    const lease = db.acquire(id, 'web-session-test', { objects: ['a'], baseRevision: 2 })
    expect((await cli(...args)).data.error.code).toBe('locked')
    db.release(id, 'web-session-test', lease.token)
    const applied = await cli(...args)
    expect(applied.code).toBe(0)
    expect(db.read(id).markdown).toContain('B changed')
    expect(db.read(id).markdown).toContain('AI first\nAI second')
    expect((await cli(...args)).data).toEqual(applied.data)
    expect(db.read(id).revision).toBe(3)
    writeFileSync(draft, 'a second proposal from the old base')
    expect((await cli(...args)).data.error.code).toBe('stale-base')
    expect(readFileSync(draft, 'utf8')).toBe('a second proposal from the old base')
    const fresh = join(directory, 'fresh.md')
    expect((await cli('checkout', id, '--node', 'a', '--output', fresh)).code).toBe(0)
    writeFileSync(fresh, 'fresh proposal')
    expect((await cli('apply', id, '--node', 'a', '--input', fresh)).code).toBe(0)
    expect(db.read(id).revision).toBe(4)
    const metadataPath = `${fresh}.boardmark-checkout.json`
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    writeFileSync(metadataPath, JSON.stringify({ ...metadata, api: 'http://different-workspace/api' }))
    expect((await cli('apply', id, '--node', 'a', '--input', fresh)).code).toBe(2)
    writeFileSync(metadataPath, JSON.stringify({ ...metadata, baseRevision: '4' }))
    expect((await cli('apply', id, '--node', 'a', '--input', fresh)).code).toBe(2)
    expect(db.read(id).revision).toBe(4)
  }, 60_000)

  it('첨부 포함 가져오기·내보내기, 편집권 차단, 기준 검증과 프로세스 재전송을 수행한다', async () => {
    const { directory, db, cli } = await setup()
    const unknownBundle = join(directory, 'unknown.boardmark.json')
    writeFileSync(unknownBundle, JSON.stringify({ format: 'future-v2', name: '잘못된 형식', markdown: '원문', assets: [] }))
    expect((await cli('document', 'import', '--input', unknownBundle)).data.error.code).toBe('invalid-request')
    expect(db.list()).toHaveLength(0)
    const source = '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":0,"y":0}}\nA ![자료](one.png)\n:::\n'
    writeFileSync(join(directory, 'board.md'), source)
    writeFileSync(join(directory, 'one.png'), Uint8Array.from([1, 2, 3]))
    const imported = await cli('document', 'import', '--input', join(directory, 'board.md'))
    expect(imported.code).toBe(0)
    const id: string = imported.data.value.id
    const output = join(directory, 'export.md')
    expect((await cli('document', 'export', id, '--output', output)).code).toBe(0)
    expect(readFileSync(output, 'utf8')).toBe(source)
    expect(JSON.parse(readFileSync(`${output}.boardmark.json`, 'utf8')).assets[0].base64).toBe('AQID')
    const body = join(directory, 'body.md')
    writeFileSync(body, 'AI 수정')
    const args = ['node', 'update', id, 'a', '--body-file', body, '--base-revision', '1', '--request-id', 'repeat']
    const lease = db.acquire(id, 'web-session-test', { objects: ['a'], baseRevision: 1 })
    expect((await cli(...args)).data.error.code).toBe('locked')
    db.release(id, 'web-session-test', lease.token)
    const updated = await cli(...args)
    expect(updated.code).toBe(0)
    expect((await cli(...args)).data).toEqual(updated.data)
    expect(db.read(id).revision).toBe(2)
    expect((await cli(...args.slice(0, -2), '--request-id', 'stale')).data.error.code).toBe('stale-base')
    writeFileSync(body, '다른 제안')
    expect((await cli(...args)).data.error.code).toBe('request-reused')
  }, 30_000)
})
