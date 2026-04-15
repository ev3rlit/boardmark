import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BodyEditorHost } from '@canvas-app/components/editor/body-editor-host'
import { createWysiwygMarkdownBridge } from '@canvas-app/components/editor/wysiwyg-markdown-bridge'
import type { CanvasEditingSessionState } from '@canvas-app/store/canvas-store-types'

const ACTIVE_WYSIWYG_SESSION: CanvasEditingSessionState = {
  baselineDocument: createWysiwygDocument('New note'),
  baselineMarkdown: 'New note',
  blockMode: { status: 'none' },
  dirty: false,
  draftDocument: createWysiwygDocument('New note'),
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

  it('requests a single commit when focus leaves the editor host', async () => {
    const onCommit = vi.fn(async () => undefined)

    renderHost({
      onCommit,
      session: ACTIVE_WYSIWYG_SESSION
    })

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })

    fireEvent.focus(editor)
    fireEvent.blur(editor)

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledTimes(1)
    })
  })

  it('does not render the formatting toolbar for textarea fallback sessions', () => {
    renderHost({
      session: {
        ...ACTIVE_WYSIWYG_SESSION,
        draftDocument: null,
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
          onDocumentChange={() => undefined}
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

  it('lets zoom-qualified wheel events escape the editor host', async () => {
    const onWheel = vi.fn()

    render(
      <div onWheel={onWheel}>
        <BodyEditorHost
          ariaLabel="Edit welcome"
          editable
          onBlockModeChange={() => undefined}
          onCancel={() => undefined}
          onCommit={async () => undefined}
          onDocumentChange={() => undefined}
          onInteractionChange={() => undefined}
          onMarkdownChange={() => undefined}
          session={ACTIVE_WYSIWYG_SESSION}
          toolbarAnchorRef={createDefaultAnchorRef()}
        />
      </div>
    )

    const editor = await screen.findByRole('textbox', { name: 'Edit welcome' })
    fireEvent.wheel(editor, {
      ctrlKey: true,
      deltaY: -120
    })

    expect(onWheel).toHaveBeenCalledTimes(1)
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

  it('routes block-local Escape through onCancel without triggering blur commit', async () => {
    const onCancel = vi.fn()
    const onCommit = vi.fn(async () => undefined)

    renderHost({
      onCancel,
      onCommit,
      session: {
        ...ACTIVE_WYSIWYG_SESSION,
        draftDocument: createWysiwygDocument('```ts\nconst shipped = true\n```'),
        draftMarkdown: '```ts\nconst shipped = true\n```'
      }
    })

    const preview = await waitFor(() => {
      const element = document.querySelector('.canvas-wysiwyg-code-block__preview')

      if (!(element instanceof HTMLElement)) {
        throw new Error('Expected a code block preview to exist.')
      }

      return element
    })

    fireEvent.mouseDown(preview)

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' })
    fireEvent.keyDown(codeMarkdown, { key: 'Escape', code: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not commit when a special fenced block converts into a general code block during editing', async () => {
    const onCommit = vi.fn(async () => undefined)

    renderHost({
      onCommit,
      session: {
        ...ACTIVE_WYSIWYG_SESSION,
        draftDocument: createWysiwygDocument('```mermaid\n\n```'),
        draftMarkdown: '```mermaid\n\n```'
      }
    })

    const preview = await waitFor(() => {
      const element = document.querySelector('.canvas-wysiwyg-special-block .canvas-wysiwyg-code-block__preview')

      if (!(element instanceof HTMLElement)) {
        throw new Error('Expected a special fenced block preview to exist.')
      }

      return element
    })

    fireEvent.mouseDown(preview)

    const specialSource = await screen.findByRole('textbox', { name: 'Code block markdown' })
    fireEvent.change(specialSource, {
      target: {
        value: '```python\n\n```'
      }
    })

    const codeMarkdown = await screen.findByRole('textbox', { name: 'Code block markdown' })

    await waitFor(() => {
      expect(codeMarkdown).toHaveFocus()
      expect(onCommit).not.toHaveBeenCalled()
    })
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
  onCancel = () => undefined,
  onCommit = async () => undefined,
  session
}: {
  anchorRef?: ReturnType<typeof createAnchorRef>
  onCancel?: () => void
  onCommit?: () => Promise<unknown>
  session: CanvasEditingSessionState
}) {
  return render(
    <div style={{ paddingTop: '80px' }}>
      <BodyEditorHost
        ariaLabel="Edit welcome"
        editable
        onBlockModeChange={() => undefined}
        onCancel={onCancel}
        onCommit={onCommit}
        onDocumentChange={() => undefined}
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

function createWysiwygDocument(markdown: string) {
  return createWysiwygMarkdownBridge().fromMarkdown(markdown)
}
