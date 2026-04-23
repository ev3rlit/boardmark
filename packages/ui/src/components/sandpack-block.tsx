import { useEffect, useMemo, useRef, useState } from 'react'
import { Sandpack, SandpackLayout, SandpackPreview, SandpackProvider } from '@codesandbox/sandpack-react'
import {
  BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
  BOARDMARK_SANDPACK_INTERNAL_DEPENDENCIES,
  BOARDMARK_SANDPACK_SNAPSHOT_HELPER_FILE,
  BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  SANDPACK_DEFAULT_TEMPLATE,
  generateResizeIndex,
  generateSandpackSnapshotHelper,
  isSupportedTemplate
} from '../lib/sandpack-config'
import {
  composeSandpackSourceInput,
  parseSandpackSource
} from './fenced-block/sandpack-source-parser-registry'
import type { SandpackDocument } from './fenced-block/sandpack-source-types'
import {
  registerSandpackBlockPayload,
  unregisterSandpackBlockPayload
} from './sandpack-block-registry'

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
  const figureRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const element = figureRef.current

    if (!element) {
      return
    }

    registerSandpackBlockPayload(element, { meta, source })

    return () => {
      unregisterSandpackBlockPayload(element)
    }
  }, [meta, source])

  if (state.status === 'error') {
    return (
      <figure
        className="sandpack-block sandpack-block--error"
        data-state="error"
        ref={figureRef}
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
      ref={figureRef}
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

  const runtimeEntryFile = resolveRuntimeEntryFile(document)

  files[BOARDMARK_SANDPACK_SNAPSHOT_HELPER_FILE] = {
    code: generateSandpackSnapshotHelper(),
    hidden: true,
    readOnly: true
  }

  if (!runtimeEntryFile) {
    files['index.js'] = {
      code: generateResizeIndex(blockId),
      hidden: true,
      readOnly: true
    }
  }

  for (const file of document.files) {
    files[file.name] = {
      code:
        runtimeEntryFile === file.name
          ? prependSnapshotHelperImport(file.code)
          : file.code,
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
      dependencies: {
        ...BOARDMARK_SANDPACK_INTERNAL_DEPENDENCIES,
        ...(document.dependencies ?? {})
      },
    },
    options,
    showEditor,
  }
}

const SANDBOX_ENTRY_FILE_CANDIDATES = [
  'index.tsx',
  'index.ts',
  'index.jsx',
  'index.js',
  'main.tsx',
  'main.ts',
  'main.jsx',
  'main.js'
] as const

function resolveRuntimeEntryFile(document: SandpackDocument) {
  const activeEntry = document.files.find((file) =>
    file.active === true && isSupportedEntryFile(file.name)
  )

  if (activeEntry) {
    return activeEntry.name
  }

  return SANDBOX_ENTRY_FILE_CANDIDATES.find((candidate) =>
    document.files.some((file) => file.name === candidate)
  ) ?? null
}

function isSupportedEntryFile(path: string) {
  return SANDBOX_ENTRY_FILE_CANDIDATES.includes(path as (typeof SANDBOX_ENTRY_FILE_CANDIDATES)[number])
}

function prependSnapshotHelperImport(source: string) {
  const helperImport = `import "./${BOARDMARK_SANDPACK_SNAPSHOT_HELPER_FILE}";`

  if (source.includes(helperImport)) {
    return source
  }

  return `${helperImport}\n${source}`
}
