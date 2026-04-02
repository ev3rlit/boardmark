import { useEffect, useId, useState } from 'react'
import { renderMermaidDiagram } from '../lib/mermaid-renderer'

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
        className="mermaid-diagram"
        data-state="ready"
      >
        <div
          aria-label={diagramLabel}
          className="mermaid-diagram__viewport"
          role="img"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      </figure>
    )
  }

  if (state.status === 'error') {
    return (
      <figure
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
