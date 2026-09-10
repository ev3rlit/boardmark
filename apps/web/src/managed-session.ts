import { createStore } from 'zustand/vanilla'
import { createCanvasStore } from '@boardmark/canvas-app'
import { createCanvasMarkdownDocumentRepository, toAsyncResult, type CanvasDocumentRecord } from '@boardmark/canvas-repository'
import { createCanvasDocumentState } from '@canvas-app/document/canvas-document-state'
import { createCanvasDocumentRecordPatch } from '@canvas-app/store/canvas-store-projection'
import type { CanvasEditingService } from '@canvas-app/services/canvas-editing-service'
import type { CanvasEditingState } from '@canvas-app/store/canvas-store-types'
import { ApiError, type DocumentSnapshot, type EditRequest, type Lease } from '../../../packages/canvas-api/src/contracts'
import { createApiClient, submitCommand, type ApiConnection, type Presence } from '../../../packages/canvas-api/src/client'

type SessionStatus = 'saved' | 'changed' | 'saving' | 'offline' | 'waiting' | 'failed'
type PreparingInput = { id: string; kind: 'object' | 'edge'; text: string; baseRevision: number }
type RevertRequest = { requestId: string; revision: number; direction: 'undo' | 'redo' }
type RecoveryDraft = { documentId: string; baseRevision: number; editing: CanvasEditingState; preparing?: PreparingInput; sentEditing?: CanvasEditingState; request?: EditRequest; revert?: RevertRequest; session?: string }
export type ManagedSessionState = { snapshot: DocumentSnapshot | null; status: SessionStatus; message: string; presence: Presence[]; recovery: RecoveryDraft | null; preparing: PreparingInput | null }

export function createManagedSession(connection: ApiConnection) {
  const api = createApiClient(connection)
  const repository = createCanvasMarkdownDocumentRepository()
  const status = createStore<ManagedSessionState>(() => ({ snapshot: null, status: 'saved', message: '', presence: [], recovery: null, preparing: null }))
  let lease: Lease | null = null
  let releasing: Promise<void> = Promise.resolve()
  let baseRevision = 0
  let acquiring = 0
  let pending = false
  let planning = false
  let disposed = false
  let lastInput = Date.now()
  let editorRequest = 0
  let compositionFinished: (() => void) | null = null
  let composing = false
  let viewportSave: ReturnType<typeof setTimeout> | undefined
  let watchTimer: ReturnType<typeof setTimeout> | undefined
  let watching: AbortController | null = null
  let past: number[] = []
  let future: number[] = []
  const draftKey = (id: string) => `boardmark:draft:${connection.url}:${id}:${connection.session}`
  const draftPointer = (id: string) => `boardmark:recovery-key:${connection.url}:${id}`
  const viewportKey = (id: string) => `boardmark:viewport:${connection.url}:${id}`
  function saveDraft(draft: RecoveryDraft) {
    localStorage.setItem(draftKey(draft.documentId), JSON.stringify(draft))
    sessionStorage.setItem(draftPointer(draft.documentId), draftKey(draft.documentId))
  }
  function clearDraft(id: string) {
    localStorage.removeItem(sessionStorage.getItem(draftPointer(id)) ?? draftKey(id))
    sessionStorage.removeItem(draftPointer(id))
  }
  const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)
  function report(error: unknown) {
    const message = errorMessage(error)
    status.setState({ status: error instanceof ApiError && error.data.code === 'connection-failed' ? 'offline' : 'failed', message })
    store.setState({ operationError: message })
  }
  function record(doc: DocumentSnapshot) {
    const parsed = repository.readSource({ locator: { kind: 'memory', key: `api:${doc.id}`, name: doc.name }, source: doc.markdown, isTemplate: false })
    if (parsed.isErr()) throw new Error(parsed.error.message)
    return parsed.value
  }
  function documentState(parsed: CanvasDocumentRecord) {
    return createCanvasDocumentState({ record: parsed, isPersisted: true, persistedSnapshotSource: parsed.source })
  }
  function project(doc: DocumentSnapshot, opening = false) {
    const current = store.getState()
    let restoredViewport = current.viewport
    if (opening) {
      const saved = localStorage.getItem(viewportKey(doc.id))
      if (saved) {
        try {
          const value = JSON.parse(saved)
          if (value && [value.x, value.y, value.zoom].every(Number.isFinite) && value.zoom > 0) restoredViewport = value
        } catch { /* Invalid camera data cannot affect the persisted document. */ }
      } else restoredViewport = { x: 0, y: 0, zoom: 1 }
    }
    const parsed = record(doc)
    status.setState({ snapshot: doc })
    store.setState(createCanvasDocumentRecordPatch(parsed, {
      documentState: documentState(parsed), saveState: { status: 'saved', path: doc.name },
      viewport: restoredViewport,
      ...(opening ? {} : { viewport: current.viewport, selectedNodeIds: current.selectedNodeIds, selectedEdgeIds: current.selectedEdgeIds,
        selectedGroupIds: current.selectedGroupIds, editingState: current.editingState, clipboardState: current.clipboardState,
        history: current.history, groupSelectionState: current.groupSelectionState })
    }))
  }
  async function release() {
    acquiring++
    const previous = lease
    lease = null
    const doc = status.getState().snapshot
    if (previous && doc) releasing = Promise.all([releasing, api.release(doc.id, previous.token).catch(report)]).then(() => {})
    await releasing
  }
  async function begin(objects: string[], basis?: number) {
    // The saved result can paint before release returns; a new acquisition must
    // still wait for that release to avoid conflicting with our previous lease.
    const beforeRelease = acquiring
    await releasing
    if (beforeRelease !== acquiring) return false
    const doc = status.getState().snapshot
    if (!doc || pending || disposed) return false
    if (basis === undefined && status.getState().recovery && store.getState().editingState.status === 'idle') {
      report(new Error('보존된 초안을 먼저 복구하거나 사본으로 내보내세요.'))
      return false
    }
    if (lease && objects.every(id => lease!.objects.includes(id)) && lease.expiresAt > Date.now()) return true
    if (lease) await release()
    const sequence = ++acquiring
    try {
      const result = await api.acquire(doc.id, { objects, baseRevision: basis ?? doc.revision })
      if (sequence !== acquiring || disposed || status.getState().snapshot?.id !== doc.id) {
        await api.release(doc.id, result.token)
        return false
      }
      lease = result
      baseRevision = basis ?? doc.revision
      lastInput = Date.now()
      // Routine authority checks do not change the persisted state or mount a
      // recovery notice. Only clear a previous failure after successful recovery.
      if (['failed', 'offline', 'waiting'].includes(status.getState().status)) {
        status.setState({ status: 'saved', message: '' })
      }
      return true
    } catch (error) { report(error); return false }
  }
  const editingService: CanvasEditingService = {
    async applyIntent(_context, command) {
      const doc = status.getState().snapshot
      if (!doc || pending || planning) return { status: 'blocked', message: '이전 변경을 반영하는 중입니다.' }
      if (status.getState().recovery && store.getState().editingState.status === 'idle') return { status: 'blocked', message: '보존된 초안을 먼저 복구하세요.' }
      if (status.getState().recovery?.request || status.getState().recovery?.revert) return { status: 'blocked', message: '이전 저장 결과를 먼저 확인하세요. 보존된 초안의 다시 시도를 사용하세요.' }
      if (store.getState().editingState.status === 'active' && !lease) {
        return { status: 'blocked', message: '편집권을 잃었습니다. 보존된 초안을 열어 이전 기준으로 다시 확인하세요.' }
      }
      const held = Boolean(lease)
      planning = true
      try {
        const plan = await api.plan(doc.id, command)
        if (held && plan.objects.some(id => !lease?.objects.includes(id))) throw new Error('진행 중인 편집을 완료한 뒤 이 작업을 실행하세요.')
        if (!held && !await begin(plan.objects.length ? plan.objects : ['@create'])) return { status: 'blocked', message: status.getState().message }
        if (!lease) throw new Error('편집권을 잃었습니다. 초안을 보존했습니다.')
        pending = true
        const request = { requestId: crypto.randomUUID(), baseRevision, leaseToken: lease.token, command }
        const recovery: RecoveryDraft = { documentId: doc.id, baseRevision, editing: store.getState().editingState, sentEditing: store.getState().editingState, request, session: connection.session }
        saveDraft(recovery)
        status.setState({ status: 'saving', message: '', recovery })
        let saved: DocumentSnapshot
        try { saved = await api.edit(doc.id, request) }
        catch (error) {
          if (!(error instanceof ApiError) || error.data.code !== 'connection-failed') throw error
          saved = await api.edit(doc.id, request)
        }
        baseRevision = saved.revision
        past.push(saved.revision)
        future = []
        status.setState({ snapshot: saved, status: 'saved', message: '', recovery: null })
        clearDraft(doc.id)
        const parsed = record(saved)
        return { status: 'updated', record: parsed, documentState: documentState(parsed) }
      } catch (error) {
        report(error)
        return { status: 'blocked', message: errorMessage(error) }
      } finally {
        planning = false
        pending = false
        if (!held) void release()
      }
    }
  }
  const store = createCanvasStore({
    templateSource: '---\ntype: canvas\nversion: 2\n---\n', editingService,
    documentPicker: {
      pickOpenLocator: async () => ({ ok: false, error: { code: 'open-failed', message: '서버 문서 목록에서 문서를 여세요.' } }),
      pickSaveLocator: async () => ({ ok: false, error: { code: 'save-failed', message: 'DB 문서는 자동 저장됩니다.' } })
    },
    documentRepository: {
      read: async () => ({ ok: false, error: { kind: 'unsupported-source', message: '서버 문서 목록을 이용하세요.' } }),
      readSource: async input => toAsyncResult(repository.readSource(input)),
      save: async () => ({ ok: false, error: { kind: 'unsupported-source', message: '문서 전체 파일 저장은 DB 모드에서 사용할 수 없습니다.' } })
    },
    imageAssetBridge: {
      async importImageAsset({ bytes, fileName }) {
        try {
          const mime = /\.svg$/i.test(fileName) ? 'image/svg+xml' : /\.jpe?g$/i.test(fileName) ? 'image/jpeg' : /\.webp$/i.test(fileName) ? 'image/webp' : 'image/png'
          let binary = ''
          for (const byte of bytes) binary += String.fromCharCode(byte)
          const asset = await api.putAsset(btoa(binary), mime)
          return { ok: true, value: { src: asset.src } }
        } catch (error) { return { ok: false, error: { code: 'import-failed', message: errorMessage(error) } } }
      },
      async resolveImageSource({ src }) {
        try {
          if (/^https?:\/\//.test(src)) return { ok: true, value: { src } }
          let id = src.startsWith('asset:') ? src.slice(6) : null
          const doc = status.getState().snapshot
          if (!id && doc) id = (await api.attachments(doc.id)).find(entry => entry.path === src)?.assetId ?? null
          if (!id) throw new Error(`첨부 ${src}를 가져와야 합니다.`)
          const asset = await api.asset(id)
          return { ok: true, value: { src: `data:${asset.mime};base64,${asset.base64}` } }
        } catch (error) { return { ok: false, error: { code: 'resolve-failed', message: errorMessage(error) } } }
      },
      async openSource({ src }) {
        if (!/^https?:\/\//.test(src)) return { ok: false, error: { code: 'unsupported', message: 'DB 첨부는 묶음 내보내기로 받을 수 있습니다.' } }
        window.open(src, '_blank', 'noopener')
        return { ok: true, value: undefined }
      }
    }
  })
  const original = store.getState()
  async function startEditing(id: string, kind: 'object' | 'edge', restored?: PreparingInput) {
    if (!restored && status.getState().recovery && store.getState().editingState.status === 'idle') { report(new Error('보존된 입력 초안을 먼저 열거나 사본으로 내보내세요.')); return }
    const sequence = ++editorRequest
    const current = store.getState().editingState
    if (current.status === 'active') {
      const currentId = current.target.kind === 'object-body' ? current.target.objectId : current.target.edgeId
      if (currentId === id) return
      if (!await store.getState().commitInlineEditing()) return
    }
    if (sequence !== editorRequest) return
    const doc = status.getState().snapshot
    if (!doc) return
    status.setState({ preparing: restored ?? { id, kind, text: '', baseRevision: doc.revision } })
    try {
      const objects = kind === 'object' ? [id] : (await api.plan(doc.id, { kind: 'replace-edge-body', edgeId: id, markdown: '' })).objects
      if (sequence !== editorRequest || !await begin(objects, restored?.baseRevision)) return
      if (composing) await new Promise<void>(resolve => { compositionFinished = resolve })
      if (sequence !== editorRequest) { await release(); return }
      const text = status.getState().preparing?.text ?? ''
      if (status.getState().recovery?.preparing) clearDraft(doc.id)
      status.setState({ preparing: null, recovery: null })
      if (kind === 'object') original.startObjectEditing(id)
      else original.startEdgeEditing(id)
      if (text) {
        status.setState({ recovery: null })
        const editing = store.getState().editingState
        if (editing.status === 'active') original.updateEditingMarkdown(`${editing.draftMarkdown.replace(/\r?\n$/, '')}${text}`)
      }
    } catch (error) { report(error) }
    finally { if (sequence === editorRequest) status.setState({ preparing: null }) }
  }

  function updatePreparingText(text: string) {
    const current = status.getState()
    if (!current.preparing || !current.snapshot) return
    const preparing = { ...current.preparing, text }
    const recovery: RecoveryDraft = { documentId: current.snapshot.id, baseRevision: preparing.baseRevision, editing: { status: 'idle' }, preparing }
    try { saveDraft(recovery); status.setState({ preparing, recovery }) }
    catch (error) { report(error) }
  }
  const captureWaitingInput = (event: KeyboardEvent) => {
    if (!status.getState().preparing || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation()
      editorRequest++; compositionFinished?.(); compositionFinished = null; composing = false
      status.setState({ preparing: null, status: status.getState().recovery ? 'failed' : 'saved', message: status.getState().recovery ? '편집 준비를 취소했습니다. 입력 초안은 보존했습니다.' : '' })
      void release()
      return
    }
    if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return
    const current = status.getState().preparing!
    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace') {
      event.preventDefault(); event.stopImmediatePropagation()
      updatePreparingText(event.key === 'Backspace' ? current.text.slice(0, -1) : current.text + (event.key === 'Enter' ? '\n' : event.key))
    }
  }
  window.addEventListener('keydown', captureWaitingInput, true)
  function finishRevert(saved: DocumentSnapshot, request: RevertRequest) {
    const source = request.direction === 'undo' ? past : future
    const history = store.getState().history
    if (source.at(-1) === request.revision) {
      source.pop()
      ;(request.direction === 'undo' ? future : past).push(saved.revision)
      store.setState({ history: request.direction === 'undo'
        ? { past: history.past.slice(0, -1), future: [...history.future, history.past.at(-1)!] }
        : { past: [...history.past, history.future.at(-1)!], future: history.future.slice(0, -1) } })
    }
    project(saved)
    clearDraft(saved.id)
    status.setState({ status: 'saved', recovery: null, message: '' })
  }
  async function revert(direction: 'undo' | 'redo') {
    const doc = status.getState().snapshot
    if (!doc || pending || status.getState().recovery || store.getState().editingState.status !== 'idle') {
      report(new Error('진행 중인 편집을 완료한 뒤 변경을 취소하세요.'))
      return
    }
    const source = direction === 'undo' ? past : future
    const target = source.at(-1)
    if (!target) return
    pending = true
    try {
      const request: RevertRequest = { requestId: crypto.randomUUID(), revision: target, direction }
      const recovery: RecoveryDraft = { documentId: doc.id, baseRevision: doc.revision, editing: { status: 'idle' }, revert: request, session: connection.session }
      saveDraft(recovery)
      status.setState({ status: 'saving', message: '', recovery })
      let saved: DocumentSnapshot
      const input = { requestId: request.requestId, revision: request.revision }
      try { saved = await api.revert(doc.id, input) }
      catch (error) {
        if (!(error instanceof ApiError) || error.data.code !== 'connection-failed') throw error
        saved = await api.revert(doc.id, input)
      }
      finishRevert(saved, request)
    } catch (error) { report(error) }
    finally { pending = false }
  }
  store.setState({
    interactionAuthority: { begin, finish: release, isHeld: ids => Boolean(lease && lease.expiresAt > Date.now() && ids.every(id => lease!.objects.includes(id))) },
    hydrateTemplate: async () => {},
    startObjectEditing: id => { void startEditing(id, 'object') },
    startEdgeEditing: id => { void startEditing(id, 'edge') },
    saveCurrentDocument: async () => { await store.getState().flushEditingSession() },
    undo: () => revert('undo'),
    redo: () => revert('redo')
  })
  const unsubscribe = store.subscribe((state, previous) => {
    const doc = status.getState().snapshot
    if (doc && state.viewport !== previous.viewport) {
      clearTimeout(viewportSave)
      viewportSave = setTimeout(() => {
        try { localStorage.setItem(viewportKey(doc.id), JSON.stringify(state.viewport)) }
        catch (error) { report(error) }
      }, 200)
    }
    if (previous.editingState.status === 'active' && state.editingState.status === 'idle') void release()
    if (!doc || state.editingState === previous.editingState) return
    if (state.editingState.status === 'active' && state.editingState.dirty) {
      lastInput = Date.now()
      const recovery: RecoveryDraft = { ...status.getState().recovery, documentId: doc.id, baseRevision, editing: state.editingState }
      try {
        saveDraft(recovery)
        const currentStatus = status.getState().status
        status.setState({ status: pending ? 'saving' : ['failed', 'offline'].includes(currentStatus) ? currentStatus : 'changed', recovery })
      } catch (error) { report(error) }
    }
  })
  async function sync(signal?: AbortSignal) {
    const doc = status.getState().snapshot
    if (!doc || pending || planning || disposed) return
    try {
      const { revision, presence } = signal ? await api.waitChanges(doc.id, doc.revision, signal) : await api.changes(doc.id)
      if (signal?.aborted || disposed || pending || planning || status.getState().snapshot?.id !== doc.id) return
      const latest = revision > doc.revision ? await api.read(doc.id) : doc
      if (signal?.aborted || disposed || pending || planning || status.getState().snapshot?.id !== doc.id) return
      if (latest.revision > (status.getState().snapshot?.revision ?? 0)) project(latest)
      status.setState({ presence })
      if (status.getState().status === 'offline') status.setState({ status: status.getState().recovery ? 'failed' : 'saved', message: status.getState().recovery ? '연결되었습니다. 보존된 초안을 확인하세요.' : '' })
    } catch (error) {
      if (signal?.aborted || disposed || status.getState().snapshot?.id !== doc.id) return
      report(error)
      return false
    }
    return status.getState().snapshot?.revision === doc.revision ? 'unchanged' : 'changed'
  }
  function watch() {
    watching?.abort()
    clearTimeout(watchTimer)
    const controller = new AbortController()
    watching = controller
    const next = async () => {
      const started = Date.now()
      const result = await sync(controller.signal)
      if (controller.signal.aborted || disposed) return
      // Older servers return unchanged immediately. Preserve the old request
      // rate for those servers, without delaying new document revisions.
      const delay = result === false ? 1500 : result === undefined ? 50
        : result === 'unchanged' ? Math.max(0, 1500 - (Date.now() - started)) : 0
      watchTimer = setTimeout(() => { void next() }, delay)
    }
    void next()
  }
  const renew = setInterval(() => {
    const doc = status.getState().snapshot
    if (!lease || !doc || pending) return
    if (Date.now() - lastInput > 600_000) { void release(); report(new Error('10분 동안 입력이 없어 편집권을 반납했습니다. 초안은 보존했습니다.')); return }
    const token = lease.token
    void api.renew(doc.id, token).then(value => { if (lease?.token === value.token) lease = value }).catch(error => { if (lease?.token === token) { lease = null; report(error) } })
  }, 10_000)
  return {
    api, store, status, begin, release, sync, updatePreparingText,
    setPreparingComposition(active: boolean) { composing = active; if (!active) { compositionFinished?.(); compositionFinished = null } },
    async open(doc: DocumentSnapshot) {
      if (pending || planning || status.getState().preparing) throw new Error('진행 중인 저장·편집권 확인이 끝난 뒤 문서를 전환하세요.')
      if (store.getState().editingState.status === 'active' && !await store.getState().commitInlineEditing()) throw new Error('초안을 보존한 뒤 문서를 전환하세요.')
      editorRequest++
      status.setState({ preparing: null })
      await release()
      watching?.abort()
      project(doc, true)
      past = []
      future = []
      baseRevision = doc.revision
      const saved = localStorage.getItem(sessionStorage.getItem(draftPointer(doc.id)) ?? draftKey(doc.id))
      status.setState({ recovery: saved ? JSON.parse(saved) as RecoveryDraft : null, status: saved ? 'failed' : 'saved', message: saved ? '서버에 반영되지 않은 복구 초안이 있습니다.' : '' })
      localStorage.setItem(`boardmark:recent:${connection.url}`, doc.id)
      watch()
    },
    async archiveDraft() {
      const recovery = status.getState().recovery
      if (!recovery || pending || planning) return
      planning = true
      try {
        localStorage.setItem(`${draftKey(recovery.documentId)}:archive:${crypto.randomUUID()}`, JSON.stringify(recovery))
        await release()
        const latest = await api.read(recovery.documentId)
        store.setState({ editingState: { status: 'idle' } })
        project(latest)
        clearDraft(recovery.documentId)
        status.setState({ recovery: null, status: 'saved', message: '이전 초안을 별도 보관했습니다. 새 변경은 최신 원문을 기준으로 시작합니다.' })
      } catch (error) { report(error) }
      finally { planning = false }
    },
    async restoreDraft() {
      const recovery = status.getState().recovery
      if (!recovery || pending || planning) return
      planning = true
      try {
        await release()
        if (recovery.revert && recovery.session) {
          const replay = createApiClient({ ...connection, session: recovery.session })
          const request = recovery.revert
          await replay.revert(recovery.documentId, { requestId: request.requestId, revision: request.revision })
          finishRevert(await api.read(recovery.documentId), request)
          return
        }
        if (recovery.preparing && recovery.editing.status === 'idle') {
          await startEditing(recovery.preparing.id, recovery.preparing.kind, recovery.preparing)
          return
        }
        if (recovery.request && recovery.session) {
          const replay = createApiClient({ ...connection, session: recovery.session })
          let saved: DocumentSnapshot
          try { saved = await replay.edit(recovery.documentId, recovery.request) }
          catch (error) {
            if (!(error instanceof ApiError) || error.data.code !== 'lease-expired') throw error
            saved = await submitCommand(replay, recovery.documentId, {
              ...recovery.request,
              prepared(request) { recovery.request = request; saveDraft(recovery) }
            })
          }
          project(await api.read(saved.id))
          const editing = recovery.editing
          const sent = recovery.sentEditing
          const newer = editing.status === 'active' && sent?.status === 'active'
            && (editing.draftMarkdown !== sent.draftMarkdown || JSON.stringify(editing.draftDocument) !== JSON.stringify(sent.draftDocument))
          if (!newer) {
            store.setState({ editingState: { status: 'idle' } })
            clearDraft(saved.id)
            status.setState({ recovery: null, status: 'saved', message: '' })
            return
          }
          recovery.baseRevision = saved.revision
          delete recovery.request
          delete recovery.sentEditing
          saveDraft(recovery)
          status.setState({ recovery })
        }
        if (recovery.editing.status !== 'active') throw new Error('초안 파일을 내보내어 변경 내용을 확인하세요.')
        const id = recovery.editing.target.kind === 'object-body' ? recovery.editing.target.objectId : recovery.editing.target.edgeId
        const objects = recovery.editing.target.kind === 'object-body' ? [id]
          : (await api.plan(recovery.documentId, { kind: 'replace-edge-body', edgeId: id, markdown: '' })).objects
        lease = await api.acquire(recovery.documentId, { objects, baseRevision: recovery.baseRevision })
        baseRevision = recovery.baseRevision
        lastInput = Date.now()
        store.setState({ editingState: { ...recovery.editing, flushStatus: { status: 'idle' }, error: null } })
        status.setState({ status: 'changed', message: '' })
      } catch (error) { report(error) }
      finally { planning = false }
    },
    dispose() { disposed = true; watching?.abort(); clearTimeout(watchTimer); editorRequest++; compositionFinished?.(); window.removeEventListener('keydown', captureWaitingInput, true); clearTimeout(viewportSave); clearInterval(renew); unsubscribe(); void release() }
  }
}
export type ManagedSession = ReturnType<typeof createManagedSession>
