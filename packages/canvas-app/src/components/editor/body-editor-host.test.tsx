import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BodyEditorHost } from '@canvas-app/components/editor/body-editor-host'
import type { CanvasEditingSessionState } from '@canvas-app/store/canvas-store-types'

const ACTIVE_WYSIWYG_SESSION: CanvasEditingSessionState = {
  baselineMarkdown: 'New note',
  blockMode: { status: 'none' },
  dirty: false,
  draftMarkdown: 'New note',
  error: null,
  flushStatus: { status: 'idle' },
  interaction: 'inactive',
  status: 'active',
  surface: 'wysiwyg',
  target: {
    kind: 'object-body',
    component: 'note',
    objectId: 'welcome'
  }
}

describe('BodyEditorHost', () => {
  it('renders the formatting toolbar outside the editor surface for WYSIWYG sessions', async () => {
    const anchorRef = createAnchorRef({
      bottom: 160,
      height: 40,
      left: 100,
      right: 260,
      top: 120,
      width: 160,
      x: 100,
      y: 120
    })

    renderHost({
      anchorRef,
      session: ACTIVE_WYSIWYG_SESSION
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })
    const toolbar = await waitForToolbarElement()
    const surface = editor.closest('.canvas-wysiwyg-surface')
    const toolbarShell = toolbar.closest('.canvas-body-editor-host__toolbar-shell')
    mockToolbarRect(toolbar.parentElement as HTMLDivElement, {
      bottom: 104,
      height: 48,
      left: 0,
      right: 200,
      top: 56,
      width: 200,
      x: 0,
      y: 56
    })
    fireEvent(window, new Event('resize'))

    expect(surface).not.toBeNull()
    expect(surface).not.toContainElement(toolbar)
    expect(toolbar.parentElement).toHaveClass('canvas-body-editor-host__toolbar')
    expect(toolbarShell).not.toBeNull()
    await waitFor(() => {
      expect(toolbarShell).toHaveStyle({
        left: '80px',
        top: '56px'
      })
    })
    expect(toolbarShell).toHaveAttribute('data-placement', 'above')
  })

  it('does not commit when focus moves from the editor into the toolbar', async () => {
    const onCommit = vi.fn(async () => undefined)
    const anchorRef = createAnchorRef({
      bottom: 160,
      height: 40,
      left: 100,
      right: 260,
      top: 120,
      width: 160,
      x: 100,
      y: 120
    })

    renderHost({
      anchorRef,
      onCommit,
      session: ACTIVE_WYSIWYG_SESSION
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })
    const toolbar = await waitForToolbarElement()
    const boldButton = Array.from(toolbar.querySelectorAll('button')).find((button) => {
      return button.textContent === 'Bold'
    }) as HTMLButtonElement | undefined
    mockToolbarRect(toolbar.parentElement as HTMLDivElement, {
      bottom: 104,
      height: 48,
      left: 0,
      right: 200,
      top: 56,
      width: 200,
      x: 0,
      y: 56
    })
    fireEvent(window, new Event('resize'))
    if (!boldButton) {
      throw new Error('Expected Bold toolbar button to exist.')
    }

    fireEvent.focus(editor)
    fireEvent.blur(editor, { relatedTarget: boldButton })
    fireEvent.mouseDown(boldButton)
    fireEvent.click(boldButton)

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not render the formatting toolbar for textarea fallback sessions', () => {
    renderHost({
      session: {
        ...ACTIVE_WYSIWYG_SESSION,
        draftMarkdown: 'Fallback body',
        surface: 'textarea'
      }
    })

    expect(screen.queryByRole('toolbar', { name: 'Formatting controls' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Edit welcome' }).tagName).toBe('TEXTAREA')
  })

  it('keeps wheel events inside the editor host', async () => {
    const onWheel = vi.fn()

    render(
      <div onWheel={onWheel}>
        <BodyEditorHost
          ariaLabel="Edit welcome"
          editable
          onBlockModeChange={() => undefined}
          onCancel={() => undefined}
          onCommit={async () => undefined}
          onInteractionChange={() => undefined}
          onMarkdownChange={() => undefined}
          session={ACTIVE_WYSIWYG_SESSION}
          toolbarAnchorRef={createDefaultAnchorRef()}
        />
      </div>
    )

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })
    fireEvent.wheel(editor)

    expect(onWheel).not.toHaveBeenCalled()
  })

  it('flips the toolbar below the object when there is not enough room above', async () => {
    const anchorRef = createAnchorRef({
      bottom: 60,
      height: 40,
      left: 100,
      right: 260,
      top: 20,
      width: 160,
      x: 100,
      y: 20
    })

    renderHost({
      anchorRef,
      session: ACTIVE_WYSIWYG_SESSION
    })

    const toolbar = await waitForToolbarElement()
    const toolbarShell = toolbar.closest('.canvas-body-editor-host__toolbar-shell')

    mockToolbarRect(toolbar.parentElement as HTMLDivElement, {
      bottom: 48,
      height: 48,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0
    })
    fireEvent(window, new Event('resize'))

    await waitFor(() => {
      expect(toolbarShell).toHaveStyle({
        top: '76px'
      })
    })
    expect(toolbarShell).toHaveAttribute('data-placement', 'below')
  })

  it('clamps the toolbar within the viewport when the object is near the edges', async () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 320
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 240
    })

    try {
      const anchorRef = createAnchorRef({
        bottom: 160,
        height: 40,
        left: 250,
        right: 310,
        top: 120,
        width: 60,
        x: 250,
        y: 120
      })

      renderHost({
        anchorRef,
        session: ACTIVE_WYSIWYG_SESSION
      })

      const toolbar = await waitForToolbarElement()
      const toolbarShell = toolbar.closest('.canvas-body-editor-host__toolbar-shell')

      mockToolbarRect(toolbar.parentElement as HTMLDivElement, {
        bottom: 104,
        height: 48,
        left: 0,
        right: 200,
        top: 56,
        width: 200,
        x: 0,
        y: 56
      })
      fireEvent(window, new Event('resize'))

      await waitFor(() => {
        expect(toolbarShell).toHaveStyle({
          left: '108px'
        })
      })
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth
      })
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight
      })
    }
  })
})

function renderHost({
  anchorRef = createDefaultAnchorRef(),
  onCommit = async () => undefined,
  session
}: {
  anchorRef?: ReturnType<typeof createAnchorRef>
  onCommit?: () => Promise<unknown>
  session: CanvasEditingSessionState
}) {
  return render(
    <div style={{ paddingTop: '80px' }}>
      <BodyEditorHost
        ariaLabel="Edit welcome"
        editable
        onBlockModeChange={() => undefined}
        onCancel={() => undefined}
        onCommit={onCommit}
        onInteractionChange={() => undefined}
        onMarkdownChange={() => undefined}
        session={session}
        toolbarAnchorRef={anchorRef}
      />
    </div>
  )
}

function createDefaultAnchorRef() {
  return createAnchorRefWithRect({
    bottom: 120,
    height: 40,
    left: 100,
    right: 260,
    top: 120,
    width: 160,
    x: 100,
    y: 120
  })
}

function createAnchorRefWithRect(rect: Omit<DOMRect, 'toJSON'>) {
  const element = document.createElement('div')
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      toJSON: () => undefined
    })
  })

  return {
    current: element
  } as { current: HTMLDivElement }
}

function createAnchorRef(rect: Omit<DOMRect, 'toJSON'>) {
  return createAnchorRefWithRect(rect)
}

function mockToolbarRect(element: HTMLDivElement, rect: Omit<DOMRect, 'toJSON'>) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...rect,
      toJSON: () => undefined
    })
  })
}

async function waitForToolbarElement() {
  await waitFor(() => {
    expect(document.querySelector('.canvas-wysiwyg-toolbar')).not.toBeNull()
  })

  return document.querySelector('.canvas-wysiwyg-toolbar') as HTMLDivElement
}
