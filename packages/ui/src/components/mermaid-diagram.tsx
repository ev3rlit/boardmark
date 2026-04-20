import { useEffect, useId, useRef, useState } from 'react'
import { renderMermaidDiagram } from '../lib/mermaid-renderer'
import { MermaidDiagramAction } from './mermaid-diagram-action'
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
  const [isActionHovered, setIsActionHovered] = useState(false)
  const [isFigureHovered, setIsFigureHovered] = useState(false)
  const diagramLabel = readMermaidLabel(source)
  const rootRef = useRef<HTMLElement | null>(null)
  const imageControls = useFencedBlockImageControls({
    enabled: state.status === 'ready',
    kind: 'mermaid',
    rootRef
  })
  const QuickActionIcon = imageControls.quickAction?.icon
  const isActionVisible = isFigureHovered || isActionHovered || imageControls.quickActionMenu !== null

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
        onMouseEnter={() => {
          setIsFigureHovered(true)
        }}
        onMouseLeave={() => {
          setIsFigureHovered(false)
        }}
        onContextMenu={imageControls.onContextMenu}
        onPointerEnter={() => {
          setIsFigureHovered(true)
        }}
        onPointerLeave={() => {
          setIsFigureHovered(false)
        }}
      >
        {imageControls.quickAction && QuickActionIcon ? (
          <MermaidDiagramAction
            disabled={imageControls.quickAction.disabled}
            icon={QuickActionIcon}
            label={imageControls.quickAction.label}
            menu={imageControls.quickActionMenu}
            onBlurWithin={() => {
              setIsActionHovered(false)
            }}
            onClick={() => {
              imageControls.quickAction?.onClick()
            }}
            onPointerEnter={() => {
              setIsActionHovered(true)
            }}
            onPointerLeave={() => {
              setIsActionHovered(false)
            }}
            rootRef={rootRef}
            setTriggerNode={imageControls.bindQuickActionTriggerRef}
            visible={isActionVisible}
          />
        ) : null}
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
