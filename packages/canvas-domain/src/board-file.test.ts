// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { compileFromFile } from 'json-schema-to-typescript'
import { describe, expect, it } from 'vitest'
import { emptyBoard, parseBoard, serializeBoard, validateBoard } from './board-file'

describe('board file contract', () => {
  it('generates the committed TypeScript contract from the schema', async () => {
    const source = await compileFromFile('schemas/boardmark.schema.json', {
      bannerComment:
        '// Generated from schemas/boardmark.schema.json. Run pnpm generate:board-types; do not edit.',
      style: { singleQuote: true, semi: false, tabWidth: 2 }
    })
    expect(
      (await readFile('packages/canvas-domain/src/board-file.generated.ts', 'utf8')).replace(
        /\r\n/g,
        '\n'
      )
    ).toBe(source.replace(/\r\n/g, '\n'))
  })
  it('validates the real example and serializes without reordering', async () => {
    const source = await readFile('examples/file-board/design/overview.boardmark', 'utf8')
    const parsed = parseBoard(source)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error(parsed.error.message)
    const serialized = serializeBoard(parsed.value)
    expect(serialized.ok).toBe(true)
    if (!serialized.ok) throw new Error(serialized.error.message)
    expect(parseBoard(serialized.value)).toEqual(parsed)
    expect(serialized.value.endsWith('\n')).toBe(true)
    expect(parsed.value.items.map((item) => item.id)).toEqual(['welcome', 'reference'])
  })
  it.each([
    ['{', 'invalid-json'],
    ['{"format":"boardmark","version":2}', 'unsupported-version'],
    ['{"format":"boardmark","version":"1"}', 'invalid-structure'],
    ['{"format":"boardmark-bundle-v1"}', 'invalid-structure'],
    [JSON.stringify({ ...emptyBoard(), extra: 1 }), 'invalid-structure']
  ])('reports distinct actionable errors: %s', (source, code) => {
    expect(parseBoard(source)).toMatchObject({ ok: false, error: { code } })
  })
  const note = {
    id: 'n',
    kind: 'markdown',
    frame: { x: -5, y: 0, width: 100, height: 80 },
    content: '# 한글'
  }
  it('rejects duplicate ids across items and connections and missing endpoints', () => {
    expect(validateBoard({ ...emptyBoard(), items: [note, note] })).toMatchObject({
      ok: false,
      error: { code: 'duplicate-id' }
    })
    expect(
      validateBoard({
        ...emptyBoard(),
        items: [note],
        connections: [{ id: 'n', source: 'n', target: 'n' }]
      })
    ).toMatchObject({ ok: false, error: { code: 'duplicate-id' } })
    expect(
      validateBoard({
        ...emptyBoard(),
        items: [note],
        connections: [{ id: 'e', source: 'n', target: 'absent' }]
      })
    ).toMatchObject({ ok: false, error: { code: 'missing-target' } })
  })
  it('rejects content/reference mixing and invalid geometry even on save', () => {
    expect(
      serializeBoard({
        ...emptyBoard(),
        items: [{ ...note, reference: { kind: 'file', path: 'x.png' } }]
      }).ok
    ).toBe(false)
    expect(
      serializeBoard({ ...emptyBoard(), items: [{ ...note, frame: { ...note.frame, width: 0 } }] })
        .ok
    ).toBe(false)
    expect(
      serializeBoard({
        ...emptyBoard(),
        items: [{ ...note, frame: { ...note.frame, x: Infinity } }]
      }).ok
    ).toBe(false)
  })
  it.each(['../assets/시안.png', '..\\assets\\시안.png', 'assets/a #%.png'])(
    'accepts relative file reference %s',
    (path) => {
      expect(
        validateBoard({
          ...emptyBoard(),
          items: [{ id: 'i', kind: 'image', frame: note.frame, reference: { kind: 'file', path } }]
        }).ok
      ).toBe(true)
    }
  )
  it.each([
    'C:\\a.png',
    'C:a.png',
    '\\\\server\\a.png',
    '/tmp/a.png',
    'https://a/i.png',
    'data:image/png;base64,abc',
    'a\u0000.png'
  ])('rejects non-relative reference %s', (path) => {
    expect(
      validateBoard({
        ...emptyBoard(),
        items: [{ id: 'i', kind: 'image', frame: note.frame, reference: { kind: 'file', path } }]
      }).ok
    ).toBe(false)
  })
})
