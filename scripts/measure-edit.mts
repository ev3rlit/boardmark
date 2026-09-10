import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BoardDatabase } from '../apps/server/src/database'

// Isolated diagnostic data only. No live workspace writes or network requests.
const folder = mkdtempSync(join(tmpdir(), 'boardmark-latency-'))
for (const count of [100, 500, 1000]) {
  const markdown = '---\ntype: canvas\nversion: 2\n---\n\n' + Array.from({ length: count }, (_, i) => `::: note ${JSON.stringify({ id: `n${i}`, at: { x: i % 10 * 360, y: Math.floor(i / 10) * 260, w: 320, h: 220 } })}\nNote ${i}\n\n짧은 본문과 **강조**.\n:::\n`).join('\n')
  for (const storage of ['memory', 'disk']) {
    const db = new BoardDatabase(storage === 'memory' ? ':memory:' : join(folder, `${count}.sqlite`))
    try {
      let doc = db.create('diagnosis', { requestId: 'create', name: 'diagnosis', markdown })
      const samples: Record<string, number[]> = { read: [], plan: [], acquire: [], edit: [], release: [], total: [] }
      for (let i = 0; i < 11; i++) {
        const command = { kind: 'move-node' as const, nodeId: 'n0', x: 100 + i, y: 100 }
        const start = performance.now()
        db.read(doc.id)
        const read = performance.now()
        const plan = db.plan(doc.id, command)
        const planned = performance.now()
        const lease = db.acquire(doc.id, 'diagnosis', { objects: plan.objects, baseRevision: doc.revision })
        const acquired = performance.now()
        doc = db.edit(doc.id, 'diagnosis', { requestId: `edit-${i}`, command, leaseToken: lease.token, baseRevision: doc.revision })
        const edited = performance.now()
        db.release(doc.id, 'diagnosis', lease.token)
        const released = performance.now()
        if (i > 0) for (const [key, value] of Object.entries({ read: read - start, plan: planned - read, acquire: acquired - planned, edit: edited - acquired, release: released - edited, total: released - read })) samples[key].push(value)
      }
      console.log(JSON.stringify({ count, storage, medianMs: Object.fromEntries(Object.entries(samples).map(([key, values]) => {
        values.sort((a, b) => a - b)
        return [key, +((values[4] + values[5]) / 2).toFixed(2)]
      })) }))
    } finally { db.close() }
  }
}
