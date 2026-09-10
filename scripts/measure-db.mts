import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import { BoardDatabase } from '../apps/server/src/database'
import { parseCanvasDocument } from '../packages/canvas-parser/src/index'
import { createApiClient } from '../packages/canvas-api/src/client'

// Local diagnostics, not field INP. Run outside the test/build workload.
const seed = process.argv.includes('--seed')
const client = seed ? createApiClient({ url: process.env.BOARDMARK_API_URL ?? 'http://127.0.0.1:4317/api', token: readFileSync('.boardmark/access-token', 'utf8').trim(), session: randomUUID() }) : null
const reports = []
mkdirSync('.boardmark', { recursive: true })
for (const [count, heavy] of [[100, false], [500, false], [1000, false], [100, true]] as const) {
  const markdown = '---\ntype: canvas\nversion: 2\n---\n\n' + Array.from({ length: count }, (_, i) => {
    const body = heavy && i % 3 === 0 ? '```mermaid\ngraph LR\n A[Read] --> B[Edit] --> C[Commit]\n```'
      : heavy && i % 3 === 1 ? '```typescript\n' + 'const step = (value: number) => value + 1\n'.repeat(20) + '```'
      : `Note ${i}\n\n짧은 본문과 **강조**. [링크](https://example.com)\n\n- 첫 항목\n- 둘째 항목`
    return `::: note ${JSON.stringify({ id: `n${i}`, at: { x: i % 10 * 360 + 50, y: Math.floor(i / 10) * 260 + 50, w: 320, h: 220 } })}\n${body}\n:::\n`
  }).join('\n')
  const name = `성능 ${count}${heavy ? ' mixed' : ''}`
  const db = new BoardDatabase(':memory:')
  const doc = db.create('measure', { requestId: 'create', name, markdown })
  function measure(operation: () => unknown) {
    operation()
    const values = Array.from({ length: 7 }, () => { const start = performance.now(); operation(); return performance.now() - start }).sort((a, b) => a - b)
    return { medianMs: +values[3].toFixed(2), maxMs: +values[6].toFixed(2) }
  }
  const command = { kind: 'move-node' as const, nodeId: 'n0', x: 60, y: 60 }
  let planSequence = 0
  const entry = { name, count, bytes: Buffer.byteLength(markdown), parse: measure(() => parseCanvasDocument(markdown)), plan: measure(() => db.plan(doc.id, { ...command, x: 60 + planSequence++ })), documentId: client ? (await client.create({ requestId: randomUUID(), name, markdown })).id : undefined }
  reports.push(entry)
  console.log(JSON.stringify(entry))
  db.close()
}
writeFileSync('.boardmark/performance-db.json', JSON.stringify({ environment: { cpu: cpus()[0].model, threads: cpus().length, os: `${platform()} ${release()}`, node: process.version }, reports }, null, 2))
