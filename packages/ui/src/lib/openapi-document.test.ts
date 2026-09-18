import { describe, expect, it } from 'vitest'
import { parseOpenApi } from './openapi-document'

const spec = {
  openapi: '3.1.1',
  info: { title: 'Pets API', version: '1.0' },
  paths: {
    '/pets/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { $ref: '#/components/responses/Pet' } }
      },
      post: {
        operationId: 'savePet',
        requestBody: { $ref: '#/components/requestBodies/Pet' },
        responses: { '204': { description: 'Saved' } }
      }
    }
  },
  components: {
    requestBodies: { Pet: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
    responses: { Pet: { description: 'Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
    schemas: { Pet: { type: 'object', properties: { name: { type: 'string' }, parent: { $ref: '#/components/schemas/Pet' } } } }
  }
}

describe('parseOpenApi', () => {
  it('reads YAML and keeps API version strings', () => {
    const result = parseOpenApi('openapi: 3.0.4\ninfo: {title: Pets, version: "1.0"}\npaths: {}')
    expect(result).toMatchObject({ status: 'ready', document: { title: 'Pets', version: '1.0', operations: [] } })
  })

  it('reads JSON, inherits and overrides parameters, resolves bodies and responses, and stops cyclic schemas', () => {
    const result = parseOpenApi(JSON.stringify(spec))
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return
    const [get, post] = result.document.operations
    expect(get.key).toBe('GET /pets/{id}')
    expect(get.operationId).toBeUndefined()
    expect(get.parameters).toHaveLength(1)
    expect(JSON.stringify(get.parameters)).toContain('integer')
    expect(JSON.stringify(get.parameters)).not.toContain('string')
    expect(JSON.stringify(get.responses)).toContain('순환 참조')
    expect(JSON.stringify(get.responses)).toContain('name')
    expect(JSON.stringify(post.requestBody)).toContain('application/json')
    expect(post.key).toBe('POST /pets/{id}')
  })

  it.each(['', '[]', 'openapi: [', 'openapi: 3.1.1\ninfo: null', 'openapi: 3.1.1\nopenapi: 3.0.4'])('reports invalid input without throwing: %s', (source) => {
    expect(parseOpenApi(source).status).toBe('error')
  })

  it.each(['2.0', '3.2.0', '4.0.0'])('rejects unsupported version %s', (openapi) => {
    expect(parseOpenApi(JSON.stringify({ ...spec, openapi }))).toMatchObject({ status: 'error', message: expect.stringContaining('지원하지 않습니다') })
  })

  it.each(['https://example.com/pet.yaml', './pet.yaml', '#/missing', '#/toString', '#pet'])('reports unresolved schema reference %s', ($ref) => {
    const changed = structuredClone(spec)
    changed.components.schemas.Pet.properties.parent.$ref = $ref
    const result = parseOpenApi(JSON.stringify(changed))
    expect(result).toMatchObject({ status: 'ready', document: { warnings: [expect.stringContaining('참조')] } })
  })

  it('decodes escaped and URI-encoded JSON Pointer keys', () => {
    const result = parseOpenApi(JSON.stringify({ ...spec, paths: { '/pets': { get: { responses: { '200': { $ref: '#/components/responses/a~1b~0%20c' } } } } }, components: { responses: { 'a/b~ c': { description: 'Escaped' } } } }))
    expect(JSON.stringify(result)).toContain('Escaped')
    expect(result.status).toBe('ready')
  })

  it('does not interpret $ref inside examples as an OpenAPI reference', () => {
    const result = parseOpenApi(JSON.stringify({ ...spec, paths: { '/pets': { get: { responses: { '200': { description: 'OK', content: { 'application/json': { example: { $ref: 'literal' } } } } } } } } }))
    expect(result).toMatchObject({ status: 'ready', document: { warnings: [] } })
    expect(JSON.stringify(result)).toContain('literal')
  })

  it('stops YAML alias cycles and enforces source size', () => {
    const result = parseOpenApi('openapi: 3.1.1\ninfo: {title: Pets, version: "1"}\npaths:\n  /pets:\n    get:\n      responses:\n        "200":\n          description: OK\n          content:\n            application/json:\n              schema: &pet\n                type: object\n                properties:\n                  parent: *pet')
    expect(result.status).toBe('ready')
    expect(JSON.stringify(result)).toContain('순환 참조')
    expect(parseOpenApi(' '.repeat(500_001)).status).toBe('error')
  })

  it('rejects malformed operations and structural reference cycles', () => {
    expect(parseOpenApi(JSON.stringify({ ...spec, paths: { '/pets': { get: { responses: [] } } } })).status).toBe('error')
    expect(parseOpenApi(JSON.stringify({ ...spec, paths: { '/pets': { $ref: '#/paths/~1pets' } } })).status).toBe('error')
  })
})
