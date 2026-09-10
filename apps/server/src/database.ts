import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { fail, type AcquireRequest, type CreateRequest, type DocumentBundle, type DocumentSnapshot, type EditRequest, type Lease } from '../../../packages/canvas-api/src/contracts'
import { objectSignatures, prepareEdit, readEditableRecord } from './edit-policy'
import { prepareRevert } from './revert-policy'

// The only durable writer. All mutation policy and its commit run synchronously
// inside a short SQLite transaction; no network wait is permitted here.
export class BoardDatabase {
  private readonly db: DatabaseSync
  private readonly owner = randomUUID()
  // Keep only the most recent plan. SQLite revision is checked on every use;
  // permissions and object versions are always checked again at commit.
  private prepared: { id: string; revision: number; command: string; plan: ReturnType<typeof prepareEdit> } | null = null

  constructor(path: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, markdown TEXT NOT NULL,
        revision INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        document_id TEXT NOT NULL, revision INTEGER NOT NULL,
        name TEXT NOT NULL, markdown TEXT NOT NULL,
        session TEXT NOT NULL, request_id TEXT NOT NULL,
        PRIMARY KEY(document_id, revision)
      );
      CREATE TABLE IF NOT EXISTS requests (
        session TEXT NOT NULL, request_id TEXT NOT NULL,
        payload TEXT NOT NULL, result TEXT NOT NULL,
        PRIMARY KEY(session, request_id)
      );
      CREATE TABLE IF NOT EXISTS server_state (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS server_owner (id INTEGER PRIMARY KEY CHECK(id=1), pid INTEGER NOT NULL, token TEXT NOT NULL);
      INSERT OR IGNORE INTO server_state VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS leases (
        document_id TEXT NOT NULL, object_id TEXT NOT NULL, session TEXT NOT NULL,
        token TEXT NOT NULL, expires_at INTEGER NOT NULL,
        PRIMARY KEY(document_id, object_id)
      );
      CREATE TABLE IF NOT EXISTS object_versions (
        document_id TEXT NOT NULL, object_id TEXT NOT NULL, revision INTEGER NOT NULL,
        PRIMARY KEY(document_id, object_id)
      );
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS document_assets (
        document_id TEXT NOT NULL, path TEXT NOT NULL, asset_id TEXT NOT NULL REFERENCES assets(id),
        PRIMARY KEY(document_id, path)
      );
    `)
    try {
      this.transaction(() => {
        const owner = this.db.prepare('SELECT pid FROM server_owner WHERE id=1').get()
        if (owner) {
          let alive = true
          try { process.kill(Number(owner.pid), 0) }
          catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false }
          if (alive) throw new Error(`이 DB는 서버 프로세스 ${owner.pid}가 사용 중입니다. 서버는 DB당 하나만 실행하세요.`)
        }
        this.db.prepare('INSERT OR REPLACE INTO server_owner VALUES (1, ?, ?)').run(process.pid, this.owner)
        this.db.exec('UPDATE server_state SET generation = generation + 1; DELETE FROM leases;')
      })
    } catch (error) { this.db.close(); throw error }
  }

  close() {
    this.db.prepare('DELETE FROM server_owner WHERE token=?').run(this.owner)
    this.db.close()
  }

  list() {
    return this.db.prepare('SELECT id, name, revision FROM documents ORDER BY name, id').all()
  }

  read(id: string): DocumentSnapshot {
    const row = this.db.prepare('SELECT id, name, markdown, revision FROM documents WHERE id=?').get(id)
    if (!row) fail('not-found', `문서 ${id}를 찾을 수 없습니다.`)
    return { id: String(row.id), name: String(row.name), markdown: String(row.markdown), revision: Number(row.revision) }
  }

  create(session: string, input: CreateRequest): DocumentSnapshot {
    return this.transaction(() => this.once(session, input.requestId, { action: 'create', ...input }, () => {
      const doc = { id: randomUUID(), name: input.name, markdown: input.markdown, revision: 1 }
      this.db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run(doc.id, doc.name, doc.markdown, doc.revision)
      for (const asset of input.assets ?? []) {
        const stored = this.putAsset(Buffer.from(asset.base64, 'base64'), asset.mime)
        if (asset.path.startsWith('asset:') && asset.path !== stored.src) fail('invalid-request', '첨부 내용과 해시 경로가 일치하지 않습니다.')
        this.attach(doc.id, asset.path, stored.id)
      }
      this.record(doc, session, input.requestId)
      return doc
    }))
  }

  owners(id: string) {
    this.read(id)
    return this.db.prepare('SELECT object_id AS objectId, session, expires_at AS expiresAt FROM leases WHERE document_id=? AND expires_at>?')
      .all(id, this.now()).map(row => ({ ...row, session: createHash('sha256').update(String(row.session)).digest('hex').slice(0, 8) }))
  }

  changes(id: string) {
    const row = this.db.prepare('SELECT revision FROM documents WHERE id=?').get(id)
    if (!row) fail('not-found', `문서 ${id}를 찾을 수 없습니다.`)
    return { revision: Number(row.revision), presence: this.owners(id) }
  }

  rename(id: string, session: string, input: { requestId: string; baseRevision: number; name: string }) {
    return this.transaction(() => this.once(session, input.requestId, { action: 'rename', id, ...input }, () => {
      const doc = this.read(id)
      if (doc.revision !== input.baseRevision) fail('stale-base', '이름 변경의 기준 버전이 바뀌었습니다.', doc)
      const next = { ...doc, name: input.name, revision: doc.revision + 1 }
      this.db.prepare('UPDATE documents SET name=?, revision=? WHERE id=?').run(next.name, next.revision, id)
      this.record(next, session, input.requestId)
      return next
    }))
  }

  replace(id: string, session: string, input: { requestId: string; baseRevision: number; leaseToken: string; markdown: string }) {
    return this.transaction(() => this.once(session, input.requestId, { action: 'replace', id, ...input }, () => {
      const doc = this.read(id)
      this.checkBase(doc, input.baseRevision, ['*'])
      if (!this.readLease(id, session, input.leaseToken).includes('*')) fail('locked', '문서 전체 편집권이 필요합니다.')
      const next = { ...doc, markdown: input.markdown, revision: doc.revision + 1 }
      // Full replacement invalidates all old object bases, including removed IDs.
      this.db.prepare('UPDATE object_versions SET revision=? WHERE document_id=?').run(next.revision, id)
      const parsed = readEditableRecord(next)
      for (const object of objectSignatures(parsed).keys()) {
        this.db.prepare('INSERT INTO object_versions VALUES (?, ?, ?) ON CONFLICT(document_id, object_id) DO UPDATE SET revision=excluded.revision')
          .run(id, object, next.revision)
      }
      this.db.prepare('UPDATE documents SET markdown=?, revision=? WHERE id=?').run(next.markdown, next.revision, id)
      this.record(next, session, input.requestId)
      return next
    }))
  }

  delete(id: string, session: string, input: { requestId: string; baseRevision: number; leaseToken: string }) {
    return this.transaction(() => this.once(session, input.requestId, { action: 'delete', id, ...input }, () => {
      const doc = this.read(id)
      this.checkBase(doc, input.baseRevision, ['*'])
      if (!this.readLease(id, session, input.leaseToken).includes('*')) fail('locked', '문서 삭제에는 문서 전체 편집권이 필요합니다.')
      const archived = { ...doc, revision: doc.revision + 1 }
      // History, request records and shared attachments survive deletion.
      this.record(archived, session, input.requestId)
      this.db.prepare('DELETE FROM documents WHERE id=?').run(id)
      this.db.prepare('DELETE FROM leases WHERE document_id=?').run(id)
      return archived
    }))
  }

  putAsset(bytes: Uint8Array, mime: string) {
    const id = createHash('sha256').update(bytes).digest('hex')
    this.db.prepare('INSERT OR IGNORE INTO assets VALUES (?, ?, ?)').run(id, mime, bytes)
    return { id, src: `asset:${id}` }
  }

  asset(id: string) {
    const row = this.db.prepare('SELECT mime, bytes FROM assets WHERE id=?').get(id)
    if (!row || !(row.bytes instanceof Uint8Array)) fail('not-found', `첨부 ${id}를 찾을 수 없습니다.`)
    return { mime: String(row.mime), bytes: row.bytes }
  }

  private attach(id: string, path: string, assetId: string) {
    this.read(id)
    this.asset(assetId)
    const previous = this.db.prepare('SELECT asset_id FROM document_assets WHERE document_id=? AND path=?').get(id, path)
    if (previous && previous.asset_id !== assetId) fail('request-reused', '기존 첨부 경로를 덮어쓸 수 없습니다. 새 자료 경로를 사용하세요.')
    this.db.prepare('INSERT OR IGNORE INTO document_assets VALUES (?, ?, ?)').run(id, path, assetId)
  }

  attachments(id: string) {
    this.read(id)
    return this.db.prepare('SELECT path, asset_id AS assetId FROM document_assets WHERE document_id=?').all(id)
  }

  bundle(id: string): DocumentBundle {
    const doc = this.read(id)
    const paths = new Map(this.attachments(id).map(row => [String(row.path), String(row.assetId)]))
    for (const match of doc.markdown.matchAll(/asset:([a-f0-9]{64})/g)) paths.set(match[0], match[1])
    const assets = [...paths].map(([path, id]) => {
      const asset = this.asset(id)
      return { path, mime: asset.mime, base64: Buffer.from(asset.bytes).toString('base64') }
    })
    return { format: 'boardmark-bundle-v1', name: doc.name, markdown: doc.markdown, assets }
  }

  acquire(id: string, session: string, input: AcquireRequest): Lease {
    return this.transaction(() => {
      const doc = this.read(id)
      const objects = [...new Set(input.objects)].sort()
      if (!objects.length) fail('invalid-request', '편집할 객체를 지정하세요.')
      this.checkBase(doc, input.baseRevision, objects)
      this.db.prepare('DELETE FROM leases WHERE expires_at<=?').run(this.now())
      const active = this.db.prepare('SELECT object_id, session FROM leases WHERE document_id=?').all(id)
      if (active.some(row => row.object_id === '*' || objects.includes('*') || objects.includes(String(row.object_id)))) {
        fail('locked', '다른 편집 세션에서 편집 중입니다.', this.owners(id))
      }
      const generation = this.db.prepare('SELECT generation FROM server_state WHERE id=1').get()!
      const lease = { token: `${generation.generation}:${randomUUID()}`, objects, expiresAt: this.now() + 30_000 }
      for (const object of objects) {
        this.db.prepare('INSERT INTO leases VALUES (?, ?, ?, ?, ?)').run(id, object, session, lease.token, lease.expiresAt)
      }
      return lease
    })
  }

  renew(id: string, session: string, token: string): Lease {
    return this.transaction(() => {
      const objects = this.readLease(id, session, token)
      const expiresAt = this.now() + 30_000
      this.db.prepare('UPDATE leases SET expires_at=? WHERE document_id=? AND session=? AND token=?')
        .run(expiresAt, id, session, token)
      return { token, objects, expiresAt }
    })
  }

  release(id: string, session: string, token: string) {
    this.db.prepare('DELETE FROM leases WHERE document_id=? AND session=? AND token=?').run(id, session, token)
  }

  plan(id: string, command: EditRequest['command']) {
    return { objects: [...this.prepare(this.read(id), command).targets] }
  }

  private prepare(doc: DocumentSnapshot, command: EditRequest['command']) {
    const key = JSON.stringify(command)
    const cached = this.prepared
    if (cached?.id === doc.id && cached.revision === doc.revision && cached.command === key) return cached.plan
    const plan = prepareEdit(doc, command)
    this.prepared = { id: doc.id, revision: doc.revision, command: key, plan }
    return plan
  }

  revert(id: string, session: string, input: { requestId: string; revision: number }) {
    return this.transaction(() => this.once(session, input.requestId, { action: 'revert', id, ...input }, () => {
      const current = this.read(id)
      const saved = this.db.prepare('SELECT * FROM history WHERE document_id=? AND revision=?').get(id, input.revision)
      const prior = this.db.prepare('SELECT * FROM history WHERE document_id=? AND revision=?').get(id, input.revision - 1)
      if (!saved || !prior || saved.session !== session) fail('invalid-request', '이 세션이 확정한 객체 변경만 취소할 수 있습니다.')
      const before = { id, name: String(prior.name), markdown: String(prior.markdown), revision: input.revision - 1 }
      const after = { id, name: String(saved.name), markdown: String(saved.markdown), revision: input.revision }
      const plan = prepareRevert(current, before, after)
      for (const object of plan.affected) {
        const changed = this.db.prepare('SELECT revision FROM object_versions WHERE document_id=? AND object_id=?').get(id, object)
        if (changed && Number(changed.revision) > input.revision) fail('stale-base', `객체 ${object}가 이후에 변경되어 안전하게 취소할 수 없습니다.`, current)
      }
      const active = this.db.prepare('SELECT object_id FROM leases WHERE document_id=? AND expires_at>?').all(id, this.now())
      if (active.some(row => row.object_id === '*' || plan.affected.includes(String(row.object_id)))) fail('locked', '취소 대상이 다른 편집 세션에서 편집 중입니다.', this.owners(id))
      const next = { ...current, markdown: plan.markdown, revision: current.revision + 1 }
      // The short transaction is the automatic acquisition/commit/release boundary.
      for (const object of plan.affected) {
        this.db.prepare('INSERT INTO object_versions VALUES (?, ?, ?) ON CONFLICT(document_id, object_id) DO UPDATE SET revision=excluded.revision').run(id, object, next.revision)
      }
      this.db.prepare('UPDATE documents SET markdown=?, revision=? WHERE id=?').run(next.markdown, next.revision, id)
      this.record(next, session, input.requestId)
      return next
    }))
  }

  edit(id: string, session: string, input: EditRequest): DocumentSnapshot {
    return this.transaction(() => this.once(session, input.requestId, { action: 'edit', id, ...input }, () => {
      const doc = this.read(id)
      const plan = this.prepare(doc, input.command)
      this.checkBase(doc, input.baseRevision, plan.targets)
      const owned = this.readLease(id, session, input.leaseToken)
      if (plan.targets.some(target => !owned.includes(target) && !owned.includes('*'))) {
        fail('locked', '명령의 전체 영향 범위에 편집권이 필요합니다.', { requiredObjects: plan.targets })
      }
      const next = { ...doc, markdown: plan.markdown, revision: doc.revision + 1 }
      const { before, after } = plan
      for (const object of new Set([...before.keys(), ...after.keys()])) {
        if (before.get(object) !== after.get(object)) {
          this.db.prepare('INSERT INTO object_versions VALUES (?, ?, ?) ON CONFLICT(document_id, object_id) DO UPDATE SET revision=excluded.revision')
            .run(id, object, next.revision)
        }
      }
      this.db.prepare('UPDATE documents SET markdown=?, revision=? WHERE id=?').run(next.markdown, next.revision, id)
      this.record(next, session, input.requestId)
      return next
    }))
  }

  private readLease(id: string, session: string, token: string): string[] {
    const rows = this.db.prepare('SELECT object_id FROM leases WHERE document_id=? AND session=? AND token=? AND expires_at>?')
      .all(id, session, token, this.now())
    if (!rows.length) fail('lease-expired', '편집권이 만료되었거나 서버가 재시작했습니다. 초안을 보존하고 변경 기준을 다시 확인하세요.')
    return rows.map(row => String(row.object_id))
  }

  private checkBase(doc: DocumentSnapshot, revision: number, objects: string[]) {
    if (!Number.isSafeInteger(revision) || revision < 1 || revision > doc.revision) fail('stale-base', '읽기 기준 버전이 유효하지 않습니다.', doc)
    if (objects.includes('*')) {
      if (revision !== doc.revision) fail('stale-base', '문서 전체 작업의 기준 버전이 변경되었습니다.', doc)
      return
    }
    const cached = this.prepared
    const parsed = cached?.id === doc.id && cached.revision === doc.revision ? cached.plan.record : readEditableRecord(doc)
    const ids = new Set([...parsed.ast.nodes, ...parsed.ast.edges, ...parsed.ast.groups].map(object => object.id))
    for (const object of objects) {
      if (object === '@create') continue
      if (!ids.has(object)) fail('not-found', `객체 ${object}가 없습니다.`, doc)
      const changed = this.db.prepare('SELECT revision FROM object_versions WHERE document_id=? AND object_id=?').get(doc.id, object)
      if (changed && Number(changed.revision) > revision) {
        fail('stale-base', `객체 ${object} 또는 관련 구조가 변경되었습니다. 최신 내용을 읽고 수정안을 다시 계산하세요.`, { objectId: object, latest: doc })
      }
    }
  }

  private record(doc: DocumentSnapshot, session: string, requestId: string) {
    this.db.prepare('INSERT INTO history VALUES (?, ?, ?, ?, ?, ?)')
      .run(doc.id, doc.revision, doc.name, doc.markdown, session, requestId)
  }

  private once(session: string, requestId: string, payload: unknown, operation: () => DocumentSnapshot): DocumentSnapshot {
    const serialized = JSON.stringify(payload, (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      }
      return value
    })
    const previous = this.db.prepare('SELECT payload, result FROM requests WHERE session=? AND request_id=?').get(session, requestId)
    if (previous) {
      if (previous.payload !== serialized) fail('request-reused', '같은 요청 ID가 다른 내용에 사용되었습니다.')
      return JSON.parse(String(previous.result)) as DocumentSnapshot
    }
    const result = operation()
    this.db.prepare('INSERT INTO requests VALUES (?, ?, ?, ?)').run(session, requestId, serialized, JSON.stringify(result))
    return result
  }

  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
