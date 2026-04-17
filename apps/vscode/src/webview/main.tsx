import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@boardmark/canvas-app/styles/canvas-app.css'
import { createHostBridge, type DocumentSnapshot } from './host-bridge'

// Phase 1 mount point.
//
// At this stage we only verify the host ↔ webview channel: render the raw
// markdown source we receive from the extension host. The next slice replaces
// this with a full <CanvasApp /> mount backed by a postMessage-driven
// `BoardmarkDocumentBridge` implementation.

const bridge = createHostBridge()

function CanvasShell() {
  const [snapshot, setSnapshot] = useState<DocumentSnapshot | null>(bridge.snapshot())

  useEffect(() => {
    const unsubscribe = bridge.subscribe(setSnapshot)
    bridge.notifyReady()
    return unsubscribe
  }, [])

  if (!snapshot) {
    return <div style={{ padding: 24 }}>Loading Boardmark canvas…</div>
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: 16,
        whiteSpace: 'pre-wrap',
        fontFamily: 'var(--vscode-editor-font-family, monospace)',
        fontSize: 13
      }}
    >
      {snapshot.source}
    </pre>
  )
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Boardmark webview root element not found.')
}

createRoot(container).render(
  <StrictMode>
    <CanvasShell />
  </StrictMode>
)
