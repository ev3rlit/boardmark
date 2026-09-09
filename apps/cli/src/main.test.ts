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
