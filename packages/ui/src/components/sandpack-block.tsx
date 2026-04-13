import { useEffect, useMemo, useState } from 'react'
import { Sandpack, SandpackLayout, SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react'
import {
  BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
  BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  SANDPACK_DEFAULT_TEMPLATE,
  generateResizeIndex,
  isSupportedTemplate,
} from '../lib/sandpack-config'

export type SandpackBlockProps = {
  source: string
}

type SandpackConfig = {
  template?: unknown
  files: Record<string, string>
  dependencies?: Record<string, string>
  options?: Record<string, unknown>
}

type SandpackBlockState =
  | { status: 'error'; message: string }
  | { status: 'ready'; config: SandpackConfig }

export function SandpackBlock({ source }: SandpackBlockProps) {
  const state = useMemo(() => parseSandpackSource(source), [source])
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
          <code>{source}</code>
        </pre>
      </figure>
    )
  }

  const { template, files, customSetup, options, showEditor } = buildSandpackProps(state.config, blockId)

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

function parseSandpackSource(source: string): SandpackBlockState {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'JSON parse failed.',
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'error', message: 'Sandpack config must be a JSON object.' }
  }

  const config = parsed as Record<string, unknown>

  if (!config.files || typeof config.files !== 'object' || Array.isArray(config.files)) {
    return { status: 'error', message: 'Sandpack config must include a "files" object.' }
  }

  return {
    status: 'ready',
    config: {
      template: config.template,
      files: config.files as Record<string, string>,
      dependencies: isStringRecord(config.dependencies) ? config.dependencies : undefined,
      options: isObjectRecord(config.options) ? config.options : undefined,
    },
  }
}

function buildSandpackProps(config: SandpackConfig, blockId: string) {
  const template = isSupportedTemplate(config.template)
    ? config.template
    : SANDPACK_DEFAULT_TEMPLATE

  const files: Record<string, { code: string }> = {}

  // 사용자가 index.js를 제공하지 않은 경우 높이 리포터가 포함된 index.js를 자동 주입한다.
  if (!config.files['index.js']) {
    files['index.js'] = { code: generateResizeIndex(blockId) }
  }

  for (const [path, code] of Object.entries(config.files)) {
    files[path] = { code }
  }

  const { showEditor: showEditorOption, ...userOptions } = config.options ?? {}
  const showEditor = showEditorOption === true

  const options = {
    ...BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
    ...userOptions,
    // 보안 옵션은 항상 마지막에 강제 적용
    ...BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  }

  return {
    template,
    files,
    customSetup: {
      dependencies: config.dependencies ?? {},
    },
    options,
    showEditor,
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
