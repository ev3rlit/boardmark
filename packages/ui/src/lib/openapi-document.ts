import { JSON_SCHEMA, load } from 'js-yaml'

type ObjectValue = Record<string, unknown>

export type ApiDetail = {
  label: string
  value: string
  children: ApiDetail[]
}

export type ApiOperation = {
  key: string
  method: string
  path: string
  summary: string
  description: string
  operationId?: string
  parameters: ApiDetail[]
  requestBody?: ApiDetail
  responses: ApiDetail[]
}

export type ApiDocument = {
  title: string
  description: string
  version: string
  openapi: string
  operations: ApiOperation[]
  warnings: string[]
}

export type ApiParseResult =
  | { status: 'ready'; document: ApiDocument }
  | { status: 'error'; message: string }

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

// A documentation projection, not an OpenAPI conformance validator. No network access.
export function parseOpenApi(source: string): ApiParseResult {
  try {
    if (source.length > 500_000) throw new Error('명세는 500,000자 이하로 나누어 주세요.')
    const root = object(load(source, { schema: JSON_SCHEMA }), '문서')
    const version = requiredText(root.openapi, 'openapi')
    if (!/^3\.(0|1)\.\d+$/.test(version)) {
      throw new Error(`OpenAPI ${version}은 지원하지 않습니다. 3.0.x 또는 3.1.x를 사용해 주세요.`)
    }
    const info = object(root.info, 'info')
    const title = requiredText(info.title, 'info.title')
    const apiVersion = requiredText(info.version, 'info.version')
    const paths = root.paths === undefined && version.startsWith('3.1.')
      ? {} : object(root.paths, 'paths')
    const warnings = new Set<string>()
    let remaining = 20_000

    function reference(ref: string): unknown {
      if (ref !== '#' && !ref.startsWith('#/')) {
        throw new Error(`지원하지 않는 참조: ${ref}. 같은 문서의 #/… JSON Pointer만 지원합니다.`)
      }
      let value: unknown = root
      const pointer = decodeURIComponent(ref.slice(1))
      for (const part of pointer === '' ? [] : pointer.slice(1).split('/')) {
        if (/~(?![01])/u.test(part)) throw new Error(`잘못된 JSON Pointer: ${ref}`)
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~')
        if ((!isObject(value) && !Array.isArray(value)) || !Object.hasOwn(value, key)) {
          throw new Error(`참조 대상을 찾을 수 없습니다: ${ref}`)
        }
        value = Object.getOwnPropertyDescriptor(value, key)?.value
      }
      return value
    }

    function resolve(value: unknown, location: string, seen = new Set<unknown>()): ObjectValue {
      const item = object(value, location)
      if (item.$ref === undefined) return item
      if (seen.has(item)) throw new Error(`${location}: 순환 참조는 스키마 안에서만 표시할 수 있습니다.`)
      seen.add(item)
      const target = resolve(reference(requiredText(item.$ref, `${location}.$ref`)), location, seen)
      return version.startsWith('3.1.')
        ? { ...target, ...(typeof item.description === 'string' ? { description: item.description } : {}), ...(typeof item.summary === 'string' ? { summary: item.summary } : {}) }
        : target
    }

    function detail(label: string, value: unknown, ancestors: Set<unknown> = new Set(), depth = 0, literal = false): ApiDetail {
      if (--remaining < 0) throw new Error('명세의 표시 항목이 20,000개를 넘었습니다. 명세를 나누어 주세요.')
      if (depth > 32) {
        warnings.add('32단계보다 깊은 구조는 접었습니다. 전체 내용은 원본에서 확인하세요.')
        return { label, value: '깊이 제한 · 원본 확인', children: [] }
      }
      if (typeof value !== 'object' || value === null) {
        return { label, value: typeof value === 'string' ? value : String(value), children: [] }
      }
      if (ancestors.has(value)) return { label, value: '순환 참조 · 상위 구조와 동일', children: [] }
      const next = new Set(ancestors).add(value)
      const children: ApiDetail[] = []
      for (const [key, child] of Object.entries(value)) {
        if (!literal && key === '$ref') {
          const ref = requiredText(child, '$ref')
          let target: unknown
          try {
            target = reference(ref)
          } catch (error) {
            // Bad references are local diagnostics; the rest of the API stays readable.
            const message = `참조 ${ref}: ${errorMessage(error)}`
            warnings.add(message)
            children.push({ label: '$ref', value: message, children: [] })
            continue
          }
          children.push(detail(`참조 ${ref}`, target, next, depth + 1))
        } else {
          if (!literal && (key === '$id' || key === '$dynamicRef')) {
            throw new Error(`${key}를 사용하는 스키마는 지원하지 않습니다. 문서 루트 기준 #/… 참조를 사용해 주세요.`)
          }
          children.push(detail(key, child, next, depth + 1, literal || key === 'example' || key === 'examples' || key === 'default' || key === 'enum'))
        }
      }
      return { label, value: Array.isArray(value) ? `${value.length}개` : text(object(value, label).type) || (children.length ? '' : '{}'), children }
    }

    function parameters(value: unknown, location: string): ObjectValue[] {
      if (value === undefined) return []
      if (!Array.isArray(value)) throw new Error(`${location}: 배열이 필요합니다.`)
      return value.map((entry) => {
        const parameter = resolve(entry, location)
        requiredText(parameter.name, `${location}.name`)
        if (!['path', 'query', 'header', 'cookie'].includes(text(parameter.in))) {
          throw new Error(`${location}.in: path, query, header, cookie 중 하나가 필요합니다.`)
        }
        return parameter
      })
    }

    const operations: ApiOperation[] = []
    for (const [path, rawPath] of Object.entries(paths)) {
      if (path.startsWith('x-')) continue
      if (!path.startsWith('/')) throw new Error(`paths.${path}: 경로는 /로 시작해야 합니다.`)
      const item = resolve(rawPath, `paths.${path}`)
      const inherited = parameters(item.parameters, `${path}.parameters`)
      for (const method of methods) {
        if (item[method] === undefined) continue
        const operation = object(item[method], `${method} ${path}`)
        const key = `${method.toUpperCase()} ${path}`
        const merged = new Map(inherited.map((p) => [`${p.in}:${p.name}`, p]))
        for (const p of parameters(operation.parameters, `${key}.parameters`)) merged.set(`${p.in}:${p.name}`, p)
        const responses = object(operation.responses, `${key}.responses`)
        const responseDetails = Object.entries(responses).filter(([status]) => !status.startsWith('x-')).map(([status, response]) => {
          if (!/^(default|[1-5](?:\d{2}|XX))$/.test(status)) throw new Error(`${key}: 잘못된 응답 상태 ${status}`)
          const resolved = resolve(response, `${key}.responses.${status}`)
          if (typeof resolved.description !== 'string') throw new Error(`${key}.responses.${status}.description: 문자열이 필요합니다.`)
          return detail(status, resolved)
        })
        if (!responseDetails.length) throw new Error(`${key}.responses: 응답이 하나 이상 필요합니다.`)
        operations.push({
          key, method: method.toUpperCase(), path,
          summary: text(operation.summary), description: text(operation.description),
          operationId: typeof operation.operationId === 'string' ? operation.operationId : undefined,
          parameters: [...merged.values()].map((p) => detail(`${p.name} · ${p.in}${p.required === true ? ' · 필수' : ''}`, p)),
          requestBody: operation.requestBody === undefined ? undefined : detail('요청 본문', resolve(operation.requestBody, `${key}.requestBody`)),
          responses: responseDetails
        })
        if (operation.callbacks) warnings.add('callbacks는 이 뷰어에서 표시하지 않습니다. 원본을 확인하세요.')
      }
    }
    if (root.webhooks) warnings.add('webhooks는 이 뷰어에서 표시하지 않습니다. 원본을 확인하세요.')
    return { status: 'ready', document: { title, description: text(info.description), version: apiVersion, openapi: version, operations, warnings: [...warnings] } }
  } catch (error) {
    return { status: 'error', message: errorMessage(error) }
  }
}

function isObject(value: unknown): value is ObjectValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function object(value: unknown, location: string): ObjectValue {
  if (!isObject(value)) throw new Error(`${location}: 객체가 필요합니다.`)
  return value
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function requiredText(value: unknown, location: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${location}: 비어 있지 않은 문자열이 필요합니다.`)
  return value
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'OpenAPI 명세를 읽을 수 없습니다.'
}
