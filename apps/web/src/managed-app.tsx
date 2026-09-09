import { memo, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { CanvasApp } from '@boardmark/canvas-app'
import { createManagedSession, type ManagedSession } from './managed-session'
import type { DocumentBundle, DocumentSummary } from '../../../packages/canvas-api/src/contracts'
import './managed-app.css'

const labels = { saved: '저장됨', changed: '변경됨', saving: '저장 중', offline: '연결 끊김', waiting: '반영 대기', failed: '확인 필요' }
const ManagedCanvas = memo(CanvasApp)
const managedCapabilities = { canOpen: false, canSave: false, canPersist: true, canDropDocumentImport: false, canDropImageInsertion: true, supportsMultiSelect: true, newDocumentMode: 'reset-template' as const }
export function ManagedApp() {
  const [session, setSession] = useState<ManagedSession | null>(null)
  const [url, setUrl] = useState(localStorage.getItem('boardmark:api-url') ?? '/api')
  const [token, setToken] = useState(sessionStorage.getItem('boardmark:api-token') ?? '')
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  useEffect(() => () => session?.dispose(), [session])
  async function connect() {
    setConnecting(true)
    setError('')
    const next = createManagedSession({ url, token, session: crypto.randomUUID() })
    try {
      await next.api.list()
      localStorage.setItem('boardmark:api-url', url)
      sessionStorage.setItem('boardmark:api-token', token)
      setSession(next)
    } catch (error) {
      next.dispose()
      setError(error instanceof Error ? error.message : String(error))
    } finally { setConnecting(false) }
  }
  useEffect(() => { if (token) void connect() }, [])
  if (session) return <Workspace session={session} onDisconnect={() => { session.dispose(); setSession(null) }} />
  return <main className="db-connect">
    <form onSubmit={event => { event.preventDefault(); void connect() }}>
      <p className="db-eyebrow">BOARDMARK</p>
      <h1>생각을 펼치고,<br />함께 다듬는 공간.</h1>
      <p>Markdown 문서를 서버에 보관하고 웹과 AI에서 함께 편집하세요.</p>
      <label>API 주소<input value={url} onChange={event => setUrl(event.target.value)} required /></label>
      <label>접근 토큰<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required /></label>
      <p className="db-help">로컬 API를 실행한 뒤 .boardmark/access-token 파일의 값을 입력하세요.</p>
      <button className="db-primary" disabled={connecting}>{connecting ? '연결 중…' : '작업 공간 열기'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </main>
}

function Workspace({ session, onDisconnect }: { session: ManagedSession; onDisconnect: () => void }) {
  const state = useStore(session.status)
  const isEditing = useStore(session.store, store => store.editingState.status === 'active')
  const isGeometryPreview = useStore(session.store, store => store.pointerInteractionState.status === 'node-drag')
  const displayStatus = isGeometryPreview && state.status === 'saved' ? 'changed' : state.status
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [listOpen, setListOpen] = useState(true)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  async function run(operation: () => Promise<void>) {
    try { setMessage(''); await operation() }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  async function refresh() { setDocuments(await session.api.list()) }
  async function finishEditing() {
    const editing = session.store.getState().editingState
    const id = editing.status === 'active'
      ? editing.target.kind === 'object-body' ? editing.target.objectId : editing.target.edgeId
      : null
    if (await session.store.getState().commitInlineEditing() && id) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.react-flow [data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }))
    }
  }
  useEffect(() => {
    void run(async () => {
      await refresh()
      const url = localStorage.getItem('boardmark:api-url') ?? '/api'
      const recent = localStorage.getItem(`boardmark:recent:${url}`)
      if (recent) { await session.open(await session.api.read(recent)); setListOpen(false) }
    })
  }, [session])
  const download = (text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <main className="db-workspace" data-editing={isEditing}>
    <header className="db-header">
      <button aria-expanded={listOpen} onClick={() => { setListOpen(!listOpen); void run(refresh) }}>문서</button>
      <div className="db-document-title"><strong>{state.snapshot?.name ?? 'Boardmark'}</strong><span role="status" data-state={displayStatus}>{state.snapshot ? labels[displayStatus] : '문서를 선택하세요'}</span></div>
      {isEditing && <button className="db-primary" onClick={() => void finishEditing()}>편집 완료</button>}
      <button onClick={onDisconnect} aria-label="API 연결 설정">연결 설정</button>
    </header>
    <section className="db-canvas" aria-label="보드 캔버스">
      {state.snapshot ? <ManagedCanvas store={session.store} capabilities={managedCapabilities} />
        : <div className="db-empty"><p className="db-eyebrow">YOUR MARKDOWN WORKSPACE</p><h2>첫 보드를 만들어 보세요.</h2><p>노트를 놓고 연결하며 생각을 정리하세요.<br />AI도 같은 문서를 CLI로 읽고 수정할 수 있습니다.</p></div>}
    </section>
    {state.preparing && <aside className="db-preparing" aria-label="편집 준비">
      <label>편집권 확인 중 — 입력은 초안으로 보존합니다.
        <textarea autoFocus aria-label="편집 준비 중 입력" value={state.preparing.text}
          onCompositionStart={() => session.setPreparingComposition(true)}
          onCompositionEnd={event => { session.updatePreparingText(event.currentTarget.value); session.setPreparingComposition(false) }}
          onChange={event => session.updatePreparingText(event.target.value)} />
      </label>
      <small>확보되면 입력한 내용을 노트 끝에 이어 붙입니다.</small>
    </aside>}
    {listOpen && <aside className="db-library" aria-label="서버 문서 목록">
      <div className="db-library-heading"><h2>문서</h2><button onClick={() => setListOpen(false)} aria-label="문서 목록 닫기">닫기</button></div>
      <form onSubmit={event => { event.preventDefault(); void run(async () => { const doc = await session.api.create({ requestId: crypto.randomUUID(), name: name.trim() || '새 보드', markdown: '---\ntype: canvas\nversion: 2\n---\n' }); await session.open(doc); await refresh(); setName(''); setListOpen(false) }) }}>
        <label>새 문서 이름<input value={name} onChange={event => setName(event.target.value)} placeholder="새 보드" /></label>
        <button className="db-primary">새 문서 만들기</button>
      </form>
      <label className="db-import">Markdown / 첨부 묶음 가져오기<input type="file" accept=".md,.json,text/markdown" onChange={event => { const file = event.target.files?.[0]; if (file) void run(async () => {
        const content = await file.text()
        const bundle = file.name.endsWith('.boardmark.json') ? JSON.parse(content) as DocumentBundle : null
        if (bundle && bundle.format !== 'boardmark-bundle-v1') throw new Error('지원하지 않는 첨부 묶음 형식입니다.')
        const doc = await session.api.create({ requestId: crypto.randomUUID(), name: bundle?.name ?? file.name, markdown: bundle?.markdown ?? content, assets: bundle?.assets })
        await session.open(doc); await refresh(); setListOpen(false)
      }); event.target.value = '' }} /></label>
      <p className="db-help">가져오기는 새 문서를 만듭니다. 원본 파일은 그대로 남습니다.</p>
      <ul>{documents.map(doc => <li key={doc.id}><button aria-current={state.snapshot?.id === doc.id ? 'page' : undefined} onClick={() => void run(async () => { await session.open(await session.api.read(doc.id)); setListOpen(false) })}><span>{doc.name}</span><small>v{doc.revision}</small></button></li>)}</ul>
      {state.snapshot && <div className="db-document-actions">
        <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void run(async () => { const doc = state.snapshot!; const renamed = await session.api.rename(doc.id, { requestId: crypto.randomUUID(), baseRevision: doc.revision, name: String(form.get('name')) }); await session.open(renamed); await refresh() }) }}>
          <label>현재 문서 이름<input name="name" defaultValue={state.snapshot.name} key={state.snapshot.id + state.snapshot.name} required /></label><button>이름 변경</button>
        </form>
        <button onClick={() => void run(async () => { const doc = await session.api.read(state.snapshot!.id); download(doc.markdown, `${doc.name.replace(/\.md$/, '')}.md`) })}>Markdown 내보내기</button>
        <button onClick={() => void run(async () => { const bundle = await session.api.bundle(state.snapshot!.id); download(JSON.stringify(bundle, null, 2), `${bundle.name.replace(/\.md$/, '')}.boardmark.json`) })}>Markdown + 첨부 묶음 내보내기</button>
      </div>}
    </aside>}
    {(message || state.message || (state.recovery && (state.status === 'failed' || state.status === 'offline'))) && <div className="db-recovery" role="status">
      <p>{message || state.message || '서버에 반영되지 않은 초안이 보존되어 있습니다.'}</p>
      {state.recovery && <><button onClick={() => void session.restoreDraft()}>다시 시도 / 초안 열기</button><button onClick={() => download(JSON.stringify(state.recovery, null, 2), 'boardmark-recovery.json')}>초안 사본 내보내기</button><button onClick={() => { download(JSON.stringify(state.recovery, null, 2), 'boardmark-recovery.json'); void session.archiveDraft() }}>사본 보관 후 복구 닫기</button></>}
    </div>}
    {state.presence.length > 0 && <div className="db-presence" aria-label="편집 중인 객체">{state.presence.slice(0, 4).map(owner => <span key={owner.objectId}>{owner.objectId} · 세션 {owner.session} 편집 중</span>)}</div>}
  </main>
}
