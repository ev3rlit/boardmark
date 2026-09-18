import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardWorkspace } from './BoardWorkspace'
import type {
  BoardFileBridge,
  ProjectFolder
} from '../../../../../packages/canvas-repository/src/board-file-contract'
import { emptyBoard, serializeBoard } from '../../../../../packages/canvas-domain/src/board-file'

// These checks exercise explorer interactions, not a running Electron window.
vi.mock('@boardmark/canvas-app', async (original) => ({
  ...(await original<typeof import('@boardmark/canvas-app')>()),
  CanvasApp: () => <div data-testid="existing-canvas" />
}))
afterEach(cleanup)

function setup() {
  const folders: Record<string, ProjectFolder> = {
    'C:\\project': {
      path: 'C:\\project',
      entries: [
        { path: 'C:\\project\\design', name: 'design', kind: 'directory' },
        { path: 'C:\\project\\readme.md', name: 'readme.md', kind: 'file' }
      ]
    },
    'C:\\project\\design': { path: 'C:\\project\\design', entries: [] }
  }
  const bridge: BoardFileBridge = {
    openProject: vi.fn<BoardFileBridge['openProject']>(async () => ({ ok: true, value: folders['C:\\project'] })),
    listFolder: vi.fn<BoardFileBridge['listFolder']>(async (path) => ({ ok: true, value: folders[path] })),
    createEntry: vi.fn<BoardFileBridge['createEntry']>(async (directory, name, kind) => {
      const entry = {
        path: `${directory}\\${name}`,
        name,
        kind: kind === 'file' && name.endsWith('.boardmark') ? ('board' as const) : kind
      }
      folders[directory] = { path: directory, entries: [...folders[directory].entries, entry] }
      if (kind === 'directory') folders[entry.path] = { path: entry.path, entries: [] }
      return { ok: true, value: entry }
    }),
    openBoard: vi.fn<BoardFileBridge['openBoard']>(async (path) => {
      const board = emptyBoard()
      const source = serializeBoard(board)
      if (!source.ok || !path) throw Error('Invalid test board')
      return { ok: true, value: { path, board, source: source.value } }
    }),
    saveBoard: vi.fn(),
    referenceImageFile: vi.fn(),
    resolveImage: vi.fn()
  }
  render(<BoardWorkspace bridge={bridge} />)
  return { bridge, user: userEvent.setup() }
}

describe('project explorer', () => {
  it.each(['파일', '폴더'])('cancels new %s input on outside click or Tab without creating an entry', async (kind) => {
    const { bridge, user } = setup()
    await user.click(screen.getByRole('button', { name: '프로젝트 폴더 열기' }))
    await user.click(screen.getByRole('button', { name: `새 ${kind}` }))
    const input = await screen.findByRole('textbox', { name: `새 ${kind} 이름` })
    await waitFor(() => expect(input).toHaveFocus())
    await user.clear(input)
    await user.type(input, 'draft')
    await user.click(screen.getByTestId('existing-canvas'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(bridge.createEntry).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: `새 ${kind}` }))
    const next = await screen.findByRole('textbox', { name: `새 ${kind} 이름` })
    await waitFor(() => expect(next).toHaveFocus())
    await user.tab()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(bridge.createEntry).not.toHaveBeenCalled()
  })

  it('creates a folder and a board inline under the selected folder, without a location picker', async () => {
    const { bridge, user } = setup()
    expect(screen.queryByText('Boardmark')).not.toBeInTheDocument()
    expect(screen.queryByText('기존 Markdown')).not.toBeInTheDocument()
    expect(screen.queryByText('프로젝트 폴더를 열고 보드를 만드세요')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '프로젝트 폴더 열기' }))
    await user.click(await screen.findByRole('treeitem', { name: 'design' }))
    await user.click(screen.getByRole('button', { name: '새 폴더' }))
    const folderInput = await screen.findByRole('textbox', { name: '새 폴더 이름' })
    await waitFor(() => expect(folderInput).toHaveFocus())
    await user.type(folderInput, 'drafts{Enter}')
    await screen.findByRole('treeitem', { name: 'drafts' })
    expect(bridge.createEntry).toHaveBeenLastCalledWith(
      'C:\\project\\design',
      'drafts',
      'directory'
    )
    await user.click(screen.getByRole('button', { name: '새 파일' }))
    const fileInput = await screen.findByRole('textbox', { name: '새 파일 이름' })
    await user.clear(fileInput)
    await user.type(fileInput, 'plan.boardmark{Enter}')
    await screen.findByRole('treeitem', { name: 'plan.boardmark' })
    expect(bridge.createEntry).toHaveBeenLastCalledWith(
      'C:\\project\\design\\drafts',
      'plan.boardmark',
      'file'
    )
    expect(bridge.openBoard).toHaveBeenCalledWith('C:\\project\\design\\drafts\\plan.boardmark')
    const header = await screen.findByRole('banner')
    expect(within(header).queryByRole('button', { name: '새 파일' })).not.toBeInTheDocument()
    expect(screen.getByTestId('existing-canvas')).toBeInTheDocument()
  })

  it('keeps failed names editable and uses the selected file’s parent for ordinary files', async () => {
    const { bridge, user } = setup()
    await user.click(screen.getByRole('button', { name: '프로젝트 폴더 열기' }))
    await user.click(await screen.findByRole('treeitem', { name: 'readme.md' }))
    await user.click(screen.getByRole('button', { name: '새 파일' }))
    const input = await screen.findByRole('textbox', { name: '새 파일 이름' })
    vi.mocked(bridge.createEntry).mockResolvedValueOnce({
      ok: false,
      error: { code: 'already-exists', message: '같은 이름이 있습니다.' }
    })
    await user.clear(input)
    await user.type(input, 'readme.md{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('같은 이름이 있습니다.')
    expect(input).toHaveValue('readme.md')
    await user.clear(input)
    await user.type(input, 'notes.md{Enter}')
    await screen.findByRole('treeitem', { name: 'notes.md' })
    expect(bridge.createEntry).toHaveBeenLastCalledWith('C:\\project', 'notes.md', 'file')
    expect(bridge.openBoard).not.toHaveBeenCalled()
  })

  it('supports tree navigation, folder context creation and Escape cancellation', async () => {
    const { bridge, user } = setup()
    await user.click(screen.getByRole('button', { name: '프로젝트 폴더 열기' }))
    const root = await screen.findByRole('treeitem', { name: 'project' })
    act(() => root.focus())
    await user.keyboard('{ArrowDown}')
    const folder = screen.getByRole('treeitem', { name: 'design' })
    expect(folder).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(folder).toHaveAttribute('aria-expanded', 'true'))
    fireEvent.contextMenu(folder, { clientX: 50, clientY: 50 })
    await user.click(screen.getByRole('menuitem', { name: '새 파일' }))
    const input = await screen.findByRole('textbox', { name: '새 파일 이름' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(bridge.createEntry).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '모두 접기' }))
    expect(root).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('treeitem', { name: 'design' })).not.toBeInTheDocument()
  })
})
