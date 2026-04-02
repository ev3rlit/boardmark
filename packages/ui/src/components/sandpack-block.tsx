import { useMemo } from 'react'
import { Sandpack } from '@codesandbox/sandpack-react'
import {
  BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
  BOARDMARK_SANDPACK_SECURITY_OPTIONS,
  SANDPACK_DEFAULT_TEMPLATE,
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

  const { template, files, customSetup, options } = buildSandpackProps(state.config)

  return (
    <figure
      className="sandpack-block"
      data-state="ready"
    >
      <Sandpack
        template={template}
        files={files}
        customSetup={customSetup}
        options={options}
      />
    </figure>
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

function buildSandpackProps(config: SandpackConfig) {
  const template = isSupportedTemplate(config.template)
    ? config.template
    : SANDPACK_DEFAULT_TEMPLATE

  const files: Record<string, { code: string }> = {}
  for (const [path, code] of Object.entries(config.files)) {
    files[path] = { code }
  }

  const options = {
    ...BOARDMARK_SANDPACK_DEFAULT_OPTIONS,
    ...(config.options ?? {}),
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
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
