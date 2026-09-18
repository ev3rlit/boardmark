import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import {
  FolderOpen,
  Folder,
  FilePlus,
  FolderPlus,
  File,
  Save,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp
} from 'lucide-react'
import { CanvasApp, type CanvasImageExportBridge } from '@boardmark/canvas-app'
import type {
  BoardFileBridge,
  ProjectEntry,
  ProjectFolder
} from '../../../../../packages/canvas-repository/src/board-file-contract'
import type { BoardResult } from '../../../../../packages/canvas-domain/src/board-file'
import { createBoardSession } from './board-session'
import './board-workspace.css'

const capabilities = {
  canOpen: true,
  canSave: true,
  canPersist: true,
  canDropDocumentImport: false,
  canDropImageInsertion: true,
  supportsMultiSelect: true,
  newDocumentMode: 'persist-template'
} as const

type Selection = { entry: ProjectEntry; parent: string }
type Creation = { parent: string; kind: 'file' | 'directory'; name: string; error: string }

export function BoardWorkspace({
  bridge,
  imageExportBridge
}: {
  bridge: BoardFileBridge
  imageExportBridge?: CanvasImageExportBridge
}) {
  const [session] = useState(() => createBoardSession(bridge))
  const [project, setProject] = useState<string | null>(null)
  const [folders, setFolders] = useState<Record<string, ProjectFolder>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selection, setSelection] = useState<Selection | null>(null)
  const [creation, setCreation] = useState<Creation | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; parent: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = useRef(false)
  const tree = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const document = useStore(session.store, (state) => state.document)
  const dirty = useStore(
    session.store,
    (state) => state.isDirty || (state.editingState.status === 'active' && state.editingState.dirty)
  )
  const saveState = useStore(session.store, (state) => state.saveState)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || running.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [])
  useEffect(() => {
    if (!creation || busy) return
    input.current?.focus()
    const end =
      creation.kind === 'file' && creation.name.endsWith('.boardmark')
        ? creation.name.length - '.boardmark'.length
        : creation.name.length
    input.current?.setSelectionRange(0, end)
  }, [creation?.parent, creation?.kind, busy])
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  function accept<T>(result: BoardResult<T>) {
    if (!result.ok) throw Error(`[${result.error.code}] ${result.error.message}`)
    return result.value
  }
  async function run(operation: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  async function leave() {
    if (!(await session.store.getState().flushEditingSession({ reason: 'file-action' })))
      return false
    return (
      !session.store.getState().isDirty ||
      window.confirm('저장하지 않은 보드 변경을 버리고 이동할까요? 취소 후 저장할 수 있습니다.')
    )
  }
  async function open(path?: string) {
    const current = session.store.getState().document?.locator
    if (path && current?.kind === 'file' && current.path === path) return
    if (!(await leave())) return
    const record = accept(await bridge.openBoard(path))
    if (record) session.install(record)
  }
  async function loadFolder(path: string) {
    const folder = accept(await bridge.listFolder(path))
    setFolders((current) => ({ ...current, [path]: folder }))
    return folder
  }
  const selectedFolder = selection
    ? selection.entry.kind === 'directory'
      ? selection.entry.path
      : selection.parent
    : project
  function startCreate(kind: Creation['kind'], parent = selectedFolder) {
    if (!parent || running.current) return
    setMenu(null)
    void run(async () => {
      await loadFolder(parent)
      setExpanded((current) => new Set(current).add(parent))
      setCreation({ parent, kind, name: kind === 'file' ? 'untitled.boardmark' : '', error: '' })
    })
  }
  useEffect(() => {
    session.store.setState({
      createNewDocument: async () => {
        startCreate('file')
      },
      openDocument: () => run(() => open())
    })
  })
  async function submitCreation() {
    if (!creation) return
    await run(async () => {
      const result = await bridge.createEntry(creation.parent, creation.name, creation.kind)
      if (!result.ok) {
        setCreation({ ...creation, error: result.error.message })
        return
      }
      const entry = result.value
      setCreation(null)
      setSelection({ entry, parent: creation.parent })
      await loadFolder(creation.parent)
      if (entry.kind === 'directory') {
        await loadFolder(entry.path)
        setExpanded((current) => new Set(current).add(entry.path))
      } else if (entry.kind === 'board') await open(entry.path)
    })
  }
  async function toggle(entry: ProjectEntry) {
    if (expanded.has(entry.path)) {
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(entry.path)
        return next
      })
    } else {
      await loadFolder(entry.path)
      setExpanded((current) => new Set(current).add(entry.path))
    }
  }
  function treeKey(event: KeyboardEvent<HTMLButtonElement>, entry: ProjectEntry, parent: string) {
    const rows = Array.from(
      tree.current?.querySelectorAll<HTMLButtonElement>('[role="treeitem"]') ?? []
    )
    const index = rows.indexOf(event.currentTarget)
    let target: HTMLButtonElement | undefined
    if (event.key === 'ArrowDown') target = rows[index + 1]
    else if (event.key === 'ArrowUp') target = rows[index - 1]
    else if (event.key === 'Home') target = rows[0]
    else if (event.key === 'End') target = rows.at(-1)
    else if (event.key === 'ArrowRight' && entry.kind === 'directory') {
      if (expanded.has(entry.path)) target = rows[index + 1]
      else void run(() => toggle(entry))
    } else if (event.key === 'ArrowLeft') {
      if (entry.kind === 'directory' && expanded.has(entry.path)) void run(() => toggle(entry))
      else target = rows.find((row) => row.dataset.path === parent)
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const rect = event.currentTarget.getBoundingClientRect()
      setMenu({
        x: rect.left,
        y: rect.bottom,
        parent: entry.kind === 'directory' ? entry.path : parent
      })
    } else return
    event.preventDefault()
    event.stopPropagation()
    target?.focus()
  }
  function renderEntry(entry: ProjectEntry, parent: string, depth: number) {
    const isFolder = entry.kind === 'directory'
    const isExpanded = expanded.has(entry.path)
    const selected = selection?.entry.path === entry.path
    return (
      <div key={entry.path} role="none">
        <button
          role="treeitem"
          aria-label={entry.name}
          aria-level={depth + 1}
          aria-expanded={isFolder ? isExpanded : undefined}
          aria-selected={selected}
          aria-owns={
            isFolder && isExpanded ? `folder-${encodeURIComponent(entry.path)}` : undefined
          }
          tabIndex={selected || (!selection && depth === 0) ? 0 : -1}
          data-path={entry.path}
          title={entry.path}
          disabled={busy}
          className={`canvas-navigation-panel__item board-workspace-tree-row${selected ? ' canvas-navigation-panel__item--active' : ''}`}
          style={{ paddingInlineStart: depth * 16 + 8 }}
          onFocus={() => setSelection({ entry, parent })}
          onKeyDown={(event) => treeKey(event, entry, parent)}
          onClick={() => {
            setSelection({ entry, parent })
            if (isFolder) void run(() => toggle(entry))
            else if (entry.kind === 'board') void run(() => open(entry.path))
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setSelection({ entry, parent })
            setMenu({
              x: Math.min(event.clientX, window.innerWidth - 200),
              y: Math.min(event.clientY, window.innerHeight - 100),
              parent: isFolder ? entry.path : parent
            })
          }}
        >
          {isFolder ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : (
            <span className="board-workspace-tree-spacer" />
          )}
          {isFolder ? (
            isExpanded ? (
              <FolderOpen size={16} />
            ) : (
              <Folder size={16} />
            )
          ) : (
            <File size={16} />
          )}
          <span>{entry.name}</span>
        </button>
        {isFolder && isExpanded && (
          <div role="group" id={`folder-${encodeURIComponent(entry.path)}`}>
            {creation?.parent === entry.path && (
              <form
                className="canvas-navigation-panel__search board-workspace-create"
                style={{ paddingInlineStart: (depth + 1) * 16 + 8 }}
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitCreation()
                }}
              >
                <input
                  ref={input}
                  aria-label={creation.kind === 'file' ? '새 파일 이름' : '새 폴더 이름'}
                  aria-invalid={!!creation.error}
                  aria-describedby={creation.error ? 'create-entry-error' : undefined}
                  value={creation.name}
                  disabled={busy}
                  placeholder={creation.kind === 'file' ? '파일 이름' : '폴더 이름'}
                  onChange={(event) =>
                    setCreation({ ...creation, name: event.target.value, error: '' })
                  }
                  onBlur={() => {
                    // Disabling the input during Enter submission can also blur it.
                    if (!running.current) setCreation(null)
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setCreation(null)
                    }
                  }}
                />
                {creation.error && (
                  <p id="create-entry-error" role="alert">
                    {creation.error}
                  </p>
                )}
              </form>
            )}
            {folders[entry.path]?.entries.map((child) => renderEntry(child, entry.path, depth + 1))}
          </div>
        )}
      </div>
    )
  }
  return (
    <main className="board-workspace">
      <aside className="canvas-navigation-panel board-workspace-project" aria-label="프로젝트 탐색">
        <div className="canvas-navigation-panel__toolbar board-workspace-explorer-toolbar">
          <span className="canvas-navigation-panel__eyebrow">탐색기</span>
          <button
            className="viewer-control-button"
            aria-label="프로젝트 폴더 열기"
            title="프로젝트 폴더 열기"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!(await leave())) return
                const next = accept(await bridge.openProject())
                if (!next) return
                setProject(next.path)
                setFolders({ [next.path]: next })
                setExpanded(new Set([next.path]))
                setSelection(null)
                setCreation(null)
                setMenu(null)
                session.clear()
              })
            }
          >
            <FolderOpen size={16} />
          </button>
          <button
            className="viewer-control-button"
            aria-label="새 파일"
            title="새 파일"
            disabled={busy || !project}
            onClick={() => startCreate('file')}
          >
            <FilePlus size={16} />
          </button>
          <button
            className="viewer-control-button"
            aria-label="새 폴더"
            title="새 폴더"
            disabled={busy || !project}
            onClick={() => startCreate('directory')}
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="viewer-control-button"
            aria-label="탐색기 새로고침"
            title="새로고침"
            disabled={busy || !project}
            onClick={() =>
              void run(async () => {
                if (!project) return
                const next: Record<string, ProjectFolder> = {}
                async function refresh(path: string) {
                  const folder = accept(await bridge.listFolder(path))
                  next[path] = folder
                  await Promise.all(
                    folder.entries
                      .filter((entry) => entry.kind === 'directory' && expanded.has(entry.path))
                      .map((entry) => refresh(entry.path))
                  )
                }
                await refresh(project)
                setFolders(next)
                const paths = new Set(
                  Object.values(next).flatMap((folder) => folder.entries.map((entry) => entry.path))
                )
                paths.add(project)
                if (selection && !paths.has(selection.entry.path)) setSelection(null)
                if (creation && !next[creation.parent]) setCreation(null)
              })
            }
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="viewer-control-button"
            aria-label="모두 접기"
            title="모두 접기"
            disabled={busy || !project}
            onClick={() => {
              setExpanded(new Set())
              setSelection(null)
              setCreation(null)
            }}
          >
            <ChevronsDownUp size={16} />
          </button>
        </div>
        <div
          ref={tree}
          role="tree"
          aria-label="프로젝트 파일"
          className="board-workspace-tree"
          onContextMenu={(event) => {
            if (!project || busy) return
            event.preventDefault()
            setMenu({
              x: Math.min(event.clientX, window.innerWidth - 200),
              y: Math.min(event.clientY, window.innerHeight - 100),
              parent: project
            })
          }}
        >
          {project &&
            renderEntry(
              {
                name: project.split(/[\\/]/).filter(Boolean).pop() ?? project,
                path: project,
                kind: 'directory'
              },
              project,
              0
            )}
        </div>
      </aside>
      <div className="board-workspace-editor">
        {document && (
          <header className="board-workspace-header viewer-control-group">
            <span
              className="board-workspace-title"
              title={document.locator.kind === 'file' ? document.locator.path : ''}
            >
              {document.name}
            </span>
            <span role="status">
              {saveState.status === 'saving' ? '저장 중…' : dirty ? '저장하지 않음' : '저장됨'}
            </span>
            <button
              className="viewer-control-button"
              aria-label="보드 저장"
              title="보드 저장"
              disabled={busy || !dirty || saveState.status === 'saving'}
              onClick={() => void run(() => session.store.getState().saveCurrentDocument())}
            >
              <Save size={20} />
            </button>
          </header>
        )}
        <section className="board-workspace-canvas" aria-label="화이트보드">
          <CanvasApp
            store={session.store}
            capabilities={capabilities}
            imageExportBridge={imageExportBridge}
          />
        </section>
      </div>
      {menu && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="탐색기 작업"
          className="viewer-context-menu board-workspace-menu"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenu(null)
              tree.current?.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus()
            }
            if (event.key === 'Tab') setMenu(null)
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? [])
              const index = buttons.findIndex((button) => button === event.target)
              buttons[
                (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length
              ]?.focus()
            }
          }}
        >
          <button
            role="menuitem"
            className="viewer-context-menu-item"
            onClick={() => startCreate('file', menu.parent)}
          >
            <FilePlus size={16} />새 파일
          </button>
          <button
            role="menuitem"
            className="viewer-context-menu-item"
            onClick={() => startCreate('directory', menu.parent)}
          >
            <FolderPlus size={16} />새 폴더
          </button>
        </div>
      )}
      {error && (
        <div className="canvas-navigation-panel board-workspace-error" role="alert">
          <p>{error}</p>
          <button
            className="viewer-control-button board-workspace-text-button"
            onClick={() => setError('')}
          >
            닫기
          </button>
        </div>
      )}
    </main>
  )
}
