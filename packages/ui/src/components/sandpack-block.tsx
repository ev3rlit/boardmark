import { useEffect, useMemo, useState } from 'react'
import { Sandpack, SandpackLayout, SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react'
import {
  BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
  BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  SANDPACK_DEFAULT_TEMPLATE,
  generateResizeIndex,
  isSupportedTemplate
} from '../lib/sandpack-config'
import {
  composeSandpackSourceInput,
  parseSandpackSource
} from './fenced-block/sandpack-source-parser-registry'
import type { SandpackDocument } from './fenced-block/sandpack-source-types'

export type SandpackBlockProps = {
  meta?: string
  source: string
}

type SandpackBlockState =
  | { status: 'error'; message: string }
  | { status: 'ready'; document: SandpackDocument }

export function SandpackBlock({ meta, source }: SandpackBlockProps) {
  const normalizedSource = useMemo(() => composeSandpackSourceInput({ source, meta }), [meta, source])
  const state = useMemo(() => parseSandpackBlockState(normalizedSource), [normalizedSource])
  const blockId = useMemo(() => Math.random().toString(36).slice(2), [])

  if (state.status === 'error') {
    return (
      <figure
        className="sandpack-block sandpack-block--error"
        data-state="error"
        role="group"
        aria-label="Sandpack block render error"
      >
        <p className="sandpack-block__title">Sandpack block could not be rendered.</p>
        <p className="sandpack-block__message">{state.message}</p>
        <pre className="sandpack-block__source">
          <code>{normalizedSource}</code>
        </pre>
      </figure>
    )
  }

  const { template, files, customSetup, options, showEditor } = buildSandpackProps(state.document, blockId)

  return (
    <figure
      className="sandpack-block"
      data-state="ready"
    >
      {showEditor ? (
        <Sandpack
          template={template}
          files={files}
          customSetup={customSetup}
          options={options}
        />
      ) : (
        <SandpackProvider
          template={template}
          files={files}
          customSetup={customSetup}
          options={options}
        >
          <SandpackLayout>
            <SandpackAutoResizePreview blockId={blockId} />
          </SandpackLayout>
        </SandpackProvider>
      )}
    </figure>
  )
}

function SandpackAutoResizePreview({ blockId }: { blockId: string }) {
  const [height, setHeight] = useState<number>(320)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (
        event.data?.type === 'boardmark:resize' &&
        event.data?.id === blockId &&
        typeof event.data.height === 'number'
      ) {
        setHeight(event.data.height)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [blockId])

  return (
    <SandpackPreview style={{ height, minHeight: 'unset' }} />
  )
}

function parseSandpackBlockState(source: string): SandpackBlockState {
  try {
    return {
      status: 'ready',
      document: parseSandpackSource(source).document
    }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'JSON parse failed.',
    }
  }
}

function buildSandpackProps(document: SandpackDocument, blockId: string) {
  const template = isSupportedTemplate(document.template)
    ? document.template
    : SANDPACK_DEFAULT_TEMPLATE
  const files: Record<string, {
    active?: boolean
    code: string
    hidden?: boolean
    readOnly?: boolean
  }> = {}

  // 사용자가 index.js를 제공하지 않은 경우 높이 리포터가 포함된 index.js를 자동 주입한다.
  const hasIndexFile = document.files.some((file) => file.name === 'index.js')

  if (!hasIndexFile) {
    files['index.js'] = { code: generateResizeIndex(blockId) }
  }

  for (const file of document.files) {
    files[file.name] = {
      code: file.code,
      ...(file.active ? { active: true } : {}),
      ...(file.hidden ? { hidden: true } : {}),
      ...(document.readOnly || file.readOnly ? { readOnly: true } : {})
    }
  }

  const showEditor = document.layout === 'code'

  const options = {
    ...BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
    ...(document.readOnly ? { readOnly: true } : {}),
    // 보안 옵션은 항상 마지막에 강제 적용
    ...BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  }

  return {
    template,
    files,
    customSetup: {
      dependencies: document.dependencies ?? {},
    },
    options,
    showEditor,
  }
}
