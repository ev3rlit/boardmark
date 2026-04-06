import { useEffect, useId, useRef, useState } from 'react'
import { renderMermaidDiagram } from '../lib/mermaid-renderer'
import { useFencedBlockImageControls } from './fenced-block/image-export-controls'

export type MermaidDiagramProps = {
  source: string
}

type MermaidDiagramState =
  | { status: 'loading' }
  | { status: 'ready'; svg: string }
  | { status: 'error'; message: string }

export function MermaidDiagram({ source }: MermaidDiagramProps) {
  const rawId = useId()
  const diagramId = `boardmark-mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const [state, setState] = useState<MermaidDiagramState>({ status: 'loading' })
  const diagramLabel = readMermaidLabel(source)
  const rootRef = useRef<HTMLElement | null>(null)
  const imageControls = useFencedBlockImageControls({
    enabled: state.status === 'ready',
    kind: 'mermaid',
    rootRef
  })
  const QuickActionIcon = imageControls.quickAction?.icon

  useEffect(() => {
    let cancelled = false

    setState({ status: 'loading' })

    void renderMermaidDiagram(source, diagramId)
      .then(({ svg }) => {
        if (cancelled) {
          return
        }

        setState({
          status: 'ready',
          svg
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setState({
          status: 'error',
          message: readMermaidErrorMessage(error)
        })
      })

    return () => {
      cancelled = true
    }
  }, [diagramId, source])

  if (state.status === 'ready') {
    return (
      <figure
        ref={rootRef}
        className="mermaid-diagram"
        data-state="ready"
        onContextMenu={imageControls.onContextMenu}
      >
        <div className="mermaid-diagram__header">
          {imageControls.statusMessage ? (
            <span
              className={joinClassName(
                'mermaid-diagram__action-status',
                imageControls.statusTone === 'error'
                  ? 'mermaid-diagram__action-status--error'
                  : imageControls.statusTone === 'success'
                    ? 'mermaid-diagram__action-status--success'
                    : undefined
              )}
            >
              {imageControls.statusMessage}
            </span>
          ) : (
            <span className="mermaid-diagram__action-status mermaid-diagram__action-status--placeholder">
              Diagram ready
            </span>
          )}
          {imageControls.quickAction && QuickActionIcon ? (
            <button
              aria-label={imageControls.quickAction.label}
              className={joinClassName(
                'markdown-code-block__copy-button',
                'markdown-code-block__copy-button--light',
                imageControls.quickAction.label === 'Image exported'
                  ? 'markdown-code-block__copy-button--copied'
                  : undefined,
                imageControls.quickAction.label === 'Export failed'
                  ? 'markdown-code-block__copy-button--error'
                  : undefined
              )}
              disabled={imageControls.quickAction.disabled}
              onClick={() => {
                imageControls.quickAction?.onClick()
              }}
              title={imageControls.quickAction.label}
              type="button"
            >
              <QuickActionIcon
                aria-hidden="true"
                className={joinClassName(
                  'markdown-code-block__copy-icon',
                  imageControls.quickAction.label === 'Exporting image'
                    ? 'markdown-code-block__copy-icon--spinning'
                    : undefined
                )}
              />
            </button>
          ) : null}
        </div>
        <div
          aria-label={diagramLabel}
          className="mermaid-diagram__viewport"
          role="img"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
        {imageControls.contextMenu}
      </figure>
    )
  }

  if (state.status === 'error') {
    return (
      <figure
        ref={rootRef}
        className="mermaid-diagram mermaid-diagram--error"
        data-state="error"
        role="group"
        aria-label={`${diagramLabel} render error`}
      >
        <p className="mermaid-diagram__title">Mermaid diagram could not be rendered.</p>
        <p className="mermaid-diagram__message">{state.message}</p>
        <pre className="mermaid-diagram__source">
          <code>{source}</code>
        </pre>
      </figure>
    )
  }

  return (
    <figure
      ref={rootRef}
      className="mermaid-diagram mermaid-diagram--loading"
      data-state="loading"
      aria-busy="true"
    >
      <div
        className="mermaid-diagram__status"
        role="status"
      >
        Rendering Mermaid diagram...
      </div>
    </figure>
  )
}

function readMermaidLabel(source: string) {
  const firstLine = source.split(/\r?\n/, 1)[0]?.trim()

  if (!firstLine) {
    return 'Mermaid diagram'
  }

  if (firstLine.length > 80) {
    return `Mermaid diagram: ${firstLine.slice(0, 77)}...`
  }

  return `Mermaid diagram: ${firstLine}`
}

function readMermaidErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return 'Mermaid render failed with an unknown error.'
}

function joinClassName(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ')
}
