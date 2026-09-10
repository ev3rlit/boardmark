// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BoardDatabase } from './database'

export const original = '---\ntype: canvas\nversion: 1\ncustom: keep\n---\n\n<!-- untouched -->\n\n::: note {"id":"a","at":{"x":0,"y":0},"future":42}\nAlpha\n:::\n\n::: note {"id":"b","at":{"x":300,"y":0}}\nBeta\n:::\n\n'

describe('DB Markdown 원본', () => {
  it('계획 후 다른 객체가 저장되면 최신 원문으로 다시 적용하고 다른 변경을 보존한다', () => {
    const db = new BoardDatabase(':memory:')
    try {
      const doc = db.create('web', { requestId: 'new', name: '계획 재사용', markdown: original })
      const command = { kind: 'move-node' as const, nodeId: 'a', x: 80, y: 90 }
      const plan = db.plan(doc.id, command)
      const a = db.acquire(doc.id, 'web', { objects: plan.objects, baseRevision: 1 })
      const b = db.acquire(doc.id, 'ai', { objects: ['b'], baseRevision: 1 })
      db.edit(doc.id, 'ai', { requestId: 'peer', baseRevision: 1, leaseToken: b.token, command: { kind: 'replace-object-body', objectId: 'b', markdown: '동시 변경 보존' } })
      const saved = db.edit(doc.id, 'web', { requestId: 'move', baseRevision: 1, leaseToken: a.token, command })
      expect(saved.revision).toBe(3)
      expect(saved.markdown).toContain('동시 변경 보존')
      expect(saved.markdown).toContain('"x":80')
      db.release(doc.id, 'web', a.token)
      expect(() => db.edit(doc.id, 'web', { requestId: 'without-lease', baseRevision: 3, leaseToken: a.token, command })).toThrow(/편집권/)
    } finally { db.close() }
  })

  it('붙여넣기 명령도 새 연결선이 참조하는 기존 노트의 편집권과 기준을 검사한다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    const command = { kind: 'paste-objects' as const, anchorX: 0, anchorY: 0, inPlace: true,
      payload: { origin: null, nodes: [], groups: [], edges: [{ id: 'copied', from: 'a', to: 'b', body: '' }] } }
    const plan = db.plan(doc.id, command)
    expect(plan.objects).toEqual(expect.arrayContaining(['a', 'b']))
    expect(() => db.acquire(doc.id, 'ai', { objects: plan.objects, baseRevision: 1 })).toThrow(/편집 중/)
    expect(db.read(doc.id).markdown).toBe(original)
    db.close()
  })

  it('대상이 원래 내용으로 돌아와도 오래된 제안은 거절하고 다중 명령은 부분 적용하지 않는다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: 'ABA', markdown: original })
    const lease = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    db.edit(doc.id, 'web', { requestId: 'first', baseRevision: 1, leaseToken: lease.token, command: { kind: 'replace-object-body', objectId: 'a', markdown: '중간' } })
    db.edit(doc.id, 'web', { requestId: 'back', baseRevision: 2, leaseToken: lease.token, command: { kind: 'replace-object-body', objectId: 'a', markdown: 'Alpha' } })
    db.release(doc.id, 'web', lease.token)
    expect(db.read(doc.id).markdown).toBe(original)
    expect(() => db.acquire(doc.id, 'ai', { objects: ['a'], baseRevision: 1 })).toThrow(/변경/)
    const partial = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 3 })
    expect(() => db.edit(doc.id, 'web', { requestId: 'multi', baseRevision: 3, leaseToken: partial.token, command: { kind: 'move-nodes', moves: [{ nodeId: 'a', x: 100, y: 100 }, { nodeId: 'b', x: 400, y: 100 }] } })).toThrow(/전체 영향/)
    expect(db.read(doc.id).markdown).toBe(original)
    expect(db.read(doc.id).revision).toBe(3)
    db.close()
  })
  it('같은 DB의 두 서버 실행을 거절하고 정상 종료 후 다시 열 수 있다', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'boardmark-test-')), 'board.sqlite')
    const db = new BoardDatabase(path)
    expect(() => new BoardDatabase(path)).toThrow(/하나만/)
    db.close()
    new BoardDatabase(path).close()
  })
  it('전체 교체·삭제는 모든 객체 편집과 충돌하며 삭제 후 공유 첨부는 남는다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    const asset = db.putAsset(Uint8Array.from([1]), 'image/png')
    const body = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    expect(() => db.acquire(doc.id, 'ai', { objects: ['*'], baseRevision: 1 })).toThrow(/편집 중/)
    expect(() => db.delete(doc.id, 'web', { requestId: 'delete', baseRevision: 1, leaseToken: body.token })).toThrow(/전체/)
    db.release(doc.id, 'web', body.token)
    const whole = db.acquire(doc.id, 'ai', { objects: ['*'], baseRevision: 1 })
    expect(() => db.acquire(doc.id, 'web', { objects: ['b'], baseRevision: 1 })).toThrow(/편집 중/)
    db.replace(doc.id, 'ai', { requestId: 'replace', baseRevision: 1, leaseToken: whole.token, markdown: original.replace('Alpha', '전체 교체') })
    expect(() => db.delete(doc.id, 'ai', { requestId: 'delete-old', baseRevision: 1, leaseToken: whole.token })).toThrow(/버전/)
    const request = { requestId: 'delete', baseRevision: 2, leaseToken: whole.token }
    const removed = db.delete(doc.id, 'ai', request)
    expect(db.delete(doc.id, 'ai', request)).toEqual(removed)
    expect(db.list()).toEqual([])
    expect(db.asset(asset.id).bytes).toEqual(Uint8Array.from([1]))
    db.close()
  })

  it('CRLF 문서에서 한 본문을 고쳐도 무관한 원문 구간을 바꾸지 않는다', () => {
    const db = new BoardDatabase(':memory:')
    const source = original.replace(/\n/g, '\r\n')
    const doc = db.create('web', { requestId: 'new', name: 'CRLF', markdown: source })
    const lease = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    const result = db.edit(doc.id, 'web', { requestId: 'edit', baseRevision: 1, leaseToken: lease.token, command: { kind: 'replace-object-body', objectId: 'a', markdown: '수정' } })
    expect(result.markdown.slice(0, result.markdown.indexOf('수정'))).toBe(source.slice(0, source.indexOf('Alpha')))
    expect(result.markdown.slice(result.markdown.indexOf('::: note {"id":"b"'))).toBe(source.slice(source.indexOf('::: note {"id":"b"')))
    db.close()
  })

  it('서버 재시작은 오래된 권한을 무효화하지만 확정 요청 재전송은 복구한다', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'boardmark-test-')), 'board.sqlite')
    const db = new BoardDatabase(path)
    const doc = db.create('web', { requestId: 'new', name: '재시작', markdown: original })
    const lease = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    const request = { requestId: 'confirmed', baseRevision: 1, leaseToken: lease.token, command: { kind: 'replace-object-body' as const, objectId: 'a', markdown: '확정됨' } }
    const confirmed = db.edit(doc.id, 'web', request)
    db.close()
    const restarted = new BoardDatabase(path)
    expect(restarted.edit(doc.id, 'web', request)).toEqual(confirmed)
    expect(() => restarted.edit(doc.id, 'web', { ...request, requestId: 'late', baseRevision: confirmed.revision })).toThrow(/만료|재시작/)
    const next = restarted.acquire(doc.id, 'ai', { objects: ['a'], baseRevision: confirmed.revision })
    restarted.release(doc.id, 'web', lease.token)
    expect(restarted.renew(doc.id, 'ai', next.token).token).toBe(next.token)
    restarted.close()
  })
  it('첨부 묶음을 다른 DB로 옮겨도 Markdown 원문과 첨부 바이트가 유지된다', () => {
    const db = new BoardDatabase(':memory:')
    const data = db.putAsset(Uint8Array.from([1, 2, 3]), 'application/octet-stream')
    const markdown = original + `\n![첨부](${data.src})\n`
    const doc = db.create('web', { requestId: 'import', name: '자료', markdown })
    const bundle = db.bundle(doc.id)
    const other = new BoardDatabase(':memory:')
    const imported = other.create('cli', { requestId: 'import', name: bundle.name, markdown: bundle.markdown, assets: bundle.assets })
    expect(other.read(imported.id).markdown).toBe(markdown)
    expect(other.bundle(imported.id).assets).toEqual([{ path: data.src, mime: 'application/octet-stream', base64: 'AQID' }])
    db.close(); other.close()
  })

  it('연결선 추가와 노트 삭제가 경쟁해도 편집권을 우회하거나 참조를 깨뜨리지 않는다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    const a = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    expect(() => db.acquire(doc.id, 'ai', { objects: db.plan(doc.id, { kind: 'create-edge', from: 'a', to: 'b', markdown: '' }).objects, baseRevision: 1 })).toThrow(/편집 중/)
    db.release(doc.id, 'web', a.token)
    const command = { kind: 'create-edge' as const, from: 'a', to: 'b', markdown: '관계' }
    const together = db.acquire(doc.id, 'ai', { objects: db.plan(doc.id, command).objects, baseRevision: 1 })
    db.edit(doc.id, 'ai', { requestId: 'edge', baseRevision: 1, leaseToken: together.token, command })
    db.release(doc.id, 'ai', together.token)
    expect(() => db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })).toThrow(/변경/)
    const deletion = { kind: 'delete-node' as const, nodeId: 'a' }
    const removal = db.acquire(doc.id, 'web', { objects: db.plan(doc.id, deletion).objects, baseRevision: 2 })
    const deleted = db.edit(doc.id, 'web', { requestId: 'delete', baseRevision: 2, leaseToken: removal.token, command: deletion })
    expect(deleted.markdown).not.toContain('::: edge')
    expect(deleted.markdown).toContain('Beta')
    db.close()
  })
  it('자신의 변경만 취소하고 다른 작성자의 독립 변경과 미지원 속성을 보존한다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    const a = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    const web = db.edit(doc.id, 'web', { requestId: 'web', baseRevision: 1, leaseToken: a.token, command: { kind: 'move-node', nodeId: 'a', x: 40, y: 50 } })
    db.release(doc.id, 'web', a.token)
    const b = db.acquire(doc.id, 'ai', { objects: ['b'], baseRevision: 1 })
    db.edit(doc.id, 'ai', { requestId: 'ai', baseRevision: 1, leaseToken: b.token, command: { kind: 'replace-object-body', objectId: 'b', markdown: 'AI 독립 변경' } })
    const undo = db.revert(doc.id, 'web', { requestId: 'undo', revision: web.revision })
    expect(undo.markdown).toBe(original.replace('Beta', 'AI 독립 변경'))
    const redo = db.revert(doc.id, 'web', { requestId: 'redo', revision: undo.revision })
    expect(redo.markdown).toContain('"x":40,"y":50')
    expect(redo.markdown).toContain('"future":42')
    expect(redo.markdown).toContain('AI 독립 변경')
    db.close()
  })
  it('만료·이전 소유자의 저장/반납을 차단하고 성공한 재전송은 한 번만 반영한다', () => {
    let now = 1000
    const db = new BoardDatabase(':memory:', () => now)
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    const old = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    now += 30_001
    const next = db.acquire(doc.id, 'ai', { objects: ['a'], baseRevision: 1 })
    db.release(doc.id, 'web', old.token)
    expect(() => db.edit(doc.id, 'web', { requestId: 'late', baseRevision: 1, leaseToken: old.token,
      command: { kind: 'replace-object-body', objectId: 'a', markdown: 'late' } })).toThrow(/만료/)
    const request = { requestId: 'once', baseRevision: 1, leaseToken: next.token,
      command: { kind: 'replace-object-body' as const, objectId: 'a', markdown: 'AI' } }
    const saved = db.edit(doc.id, 'ai', request)
    db.release(doc.id, 'ai', next.token)
    expect(db.edit(doc.id, 'ai', request)).toEqual(saved)
    expect(db.read(doc.id).revision).toBe(2)
    expect(() => db.edit(doc.id, 'ai', { ...request, command: { ...request.command, markdown: '다른 내용' } })).toThrow(/요청 ID/)
    expect(() => db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })).toThrow(/기준|변경/)
    db.close()
  })
  it('같은 객체는 한 세션만 편집하고 다른 객체의 변경은 함께 보존한다', () => {
    const db = new BoardDatabase(':memory:')
    const doc = db.create('web', { requestId: 'new', name: '보드', markdown: original })
    const web = db.acquire(doc.id, 'web', { objects: ['a'], baseRevision: 1 })
    expect(() => db.acquire(doc.id, 'ai', { objects: ['a', 'b'], baseRevision: 1 })).toThrow(/편집 중/)
    const ai = db.acquire(doc.id, 'ai', { objects: ['b'], baseRevision: 1 })
    db.edit(doc.id, 'web', { requestId: 'web-edit', baseRevision: 1, leaseToken: web.token,
      command: { kind: 'replace-object-body', objectId: 'a', markdown: '웹 변경' } })
    const result = db.edit(doc.id, 'ai', { requestId: 'ai-edit', baseRevision: 1, leaseToken: ai.token,
      command: { kind: 'replace-object-body', objectId: 'b', markdown: 'AI 변경' } })
    expect(result.markdown).toBe(original.replace('Alpha', '웹 변경').replace('Beta', 'AI 변경'))
    expect(result.revision).toBe(3)
    db.close()
  })
  it('가져온 원문과 문서 ID를 재시작 이후에도 그대로 읽는다', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'boardmark-test-')), 'board.sqlite')
    const first = new BoardDatabase(path)
    const doc = first.create('web', { requestId: 'import-1', name: '보드', markdown: original })
    expect(first.read(doc.id).markdown).toBe(original)
    first.close()
    const second = new BoardDatabase(path)
    expect(second.read(doc.id)).toMatchObject({ id: doc.id, name: '보드', markdown: original, revision: 1 })
    second.close()
  })
})
