import { useRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCanvasMarkdownDocumentRepository, toAsyncResult } from '@boardmark/canvas-repository'
import { createCanvasStore, type CanvasStore } from '@canvas-app/store/canvas-store'
import { useManagedGeometry } from './use-managed-geometry'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
async function setup() {
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  const repository = createCanvasMarkdownDocumentRepository()
  const store = createCanvasStore({
    templateSource: '---\ntype: canvas\nversion: 2\n---\n\n::: note {"id":"a","at":{"x":20,"y":30,"w":320,"h":220}}\nA\n:::\n',
    documentPicker: {
      pickOpenLocator: async () => ({ ok: false, error: { code: 'cancelled', kind: 'cancelled', message: 'Cancelled' } }),
      pickSaveLocator: async () => ({ ok: false, error: { code: 'cancelled', kind: 'cancelled', message: 'Cancelled' } })
    },
    documentRepository: { read: async input => toAsyncResult(await repository.read(input)), readSource: async input => toAsyncResult(repository.readSource(input)), save: async input => toAsyncResult(await repository.save(input)) }
  })
  await store.getState().hydrateTemplate()
  let approve!: (allowed: boolean) => void
  let held = false
  const begin = vi.fn(() => new Promise<boolean>(resolve => { approve = value => { held = value; resolve(value) } }))
  const finish = vi.fn(async () => { held = false })
  const commit = vi.fn(async () => {})
  store.setState({ interactionAuthority: { begin, finish, isHeld: () => held }, commitNodeMoves: commit })
  const preview = vi.fn()
  function Surface({ store }: { store: CanvasStore }) {
    const root = useRef<HTMLDivElement>(null)
    useManagedGeometry(root, store, preview)
    return <div ref={root}><div className="react-flow__node" data-id="a">A<div className="react-flow__resize-control right bottom" data-testid="resize" /></div></div>
  }
  const view = render(<Surface store={store} />)
  const node = view.getByText('A')
  const pointer = (target: Element | Window, name: string, x: number, y: number) => fireEvent(target, new MouseEvent(name, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }))
  return { node, pointer, begin, finish, commit, preview, store, view, approval: () => approve, approve: (value: boolean) => approve(value) }
}

describe('자동 편집권 드래그', () => {
  it('첫 포인터 이동에서 즉시 미리보기만 바꾸고 승인 후에만 저장한다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    expect(test.begin).not.toHaveBeenCalled()
    test.pointer(window, 'pointermove', 140, 150)
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 60, y: 80 }) })
    expect(test.store.getState().nodes[0].at).toMatchObject({ x: 20, y: 30 })
    expect(test.commit).not.toHaveBeenCalled()
    await act(async () => test.approve(true))
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 60, y: 80 }) })
    test.pointer(window, 'pointerup', 140, 150)
    await act(async () => {})
    expect(test.commit).toHaveBeenCalledWith([{ nodeId: 'a', x: 60, y: 80 }])
  })

  it('승인 전에 놓아도 최종 미리보기를 유지하고 승인 후 한 번만 저장한다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    test.pointer(window, 'pointerup', 140, 150)
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 60, y: 80 }) })
    expect(test.commit).not.toHaveBeenCalled()
    await act(async () => test.approve(true))
    expect(test.commit).toHaveBeenCalledExactlyOnceWith([{ nodeId: 'a', x: 60, y: 80 }])
    expect(test.preview).toHaveBeenLastCalledWith({})
  })

  it('승인이 거절되면 미리보기를 복원하고 저장하지 않는다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 60, y: 80 }) })
    await act(async () => test.approve(false))
    expect(test.preview).toHaveBeenLastCalledWith({})
    expect(test.commit).not.toHaveBeenCalled()
    expect(test.store.getState().nodes[0].at).toMatchObject({ x: 20, y: 30 })
  })

  it('놓은 뒤 승인 대기 중 Escape로 취소하면 늦은 승인도 저장하지 않는다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    test.pointer(window, 'pointerup', 140, 150)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(test.preview).toHaveBeenLastCalledWith({})
    await act(async () => test.approve(true))
    expect(test.commit).not.toHaveBeenCalled()
    expect(test.finish).toHaveBeenCalledTimes(1)
  })

  it('승인 대기 중 화면을 닫으면 늦은 승인으로 저장하지 않는다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    test.pointer(window, 'pointerup', 140, 150)
    await act(async () => test.view.unmount())
    await act(async () => test.approve(true))
    expect(test.commit).not.toHaveBeenCalled()
  })

  it('취소한 이전 승인이 새 드래그의 미리보기를 지우지 않는다', async () => {
    const test = await setup()
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    const firstApproval = test.approval()
    test.pointer(window, 'pointerup', 140, 150)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 180, 170)
    await act(async () => firstApproval(true))
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 100, y: 100 }) })
    expect(test.commit).not.toHaveBeenCalled()
    await act(async () => test.approve(false))
    expect(test.preview).toHaveBeenLastCalledWith({})
  })

  it('리사이즈도 즉시 미리보기하고 승인 후 크기를 저장한다', async () => {
    const test = await setup()
    const resize = vi.fn(async () => {})
    test.store.setState({ commitNodeResize: resize })
    test.pointer(test.view.getByTestId('resize'), 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ width: 360, height: 270 }) })
    test.pointer(window, 'pointerup', 140, 150)
    expect(resize).not.toHaveBeenCalled()
    await act(async () => test.approve(true))
    expect(resize).toHaveBeenCalledWith('a', expect.objectContaining({ width: 360, height: 270 }))
  })

  it('마지막 저장이 끝나기 전에 다음 제스처가 시작되어 미리보기와 편집권을 덮어쓰지 않는다', async () => {
    const test = await setup()
    let confirm!: () => void
    test.commit.mockImplementationOnce(() => new Promise<void>(resolve => { confirm = resolve }))
    test.pointer(test.node, 'pointerdown', 100, 100)
    test.pointer(window, 'pointermove', 140, 150)
    await act(async () => test.approve(true))
    test.pointer(window, 'pointerup', 140, 150)
    test.pointer(test.node, 'pointerdown', 140, 150)
    test.pointer(window, 'pointermove', 180, 150)
    await act(async () => {})
    expect(test.begin).toHaveBeenCalledTimes(1)
    expect(test.finish).not.toHaveBeenCalled()
    expect(test.preview).toHaveBeenLastCalledWith({ a: expect.objectContaining({ x: 60, y: 80 }) })
    await act(async () => confirm())
    expect(test.finish).toHaveBeenCalledTimes(1)
    test.pointer(test.node, 'pointerdown', 140, 150)
    test.pointer(window, 'pointermove', 180, 150)
    expect(test.begin).toHaveBeenCalledTimes(2)
    await act(async () => test.approve(false))
  })
})
