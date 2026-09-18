// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readBoardScene } from './board-scene'

describe('JSON board scene projection', () => {
  it('uses actual JSON source ranges and decoded Markdown without invoking the Markdown document parser', () => {
    const source =
      '{ "format":"boardmark", "version":1, "items":[{ "id":"n", "kind":"markdown", "content":"# 메모\\n내용", "frame":{"x":5,"y":10,"width":300,"height":200} }], "connections":[] }'
    const result = readBoardScene({
      locator: { kind: 'file', path: 'C:\\p\\a.boardmark' },
      source,
      isTemplate: false
    })
    if (!result.ok) throw Error(result.error.message)
    expect(result.value.storageFormat).toBe('boardmark')
    const node = result.value.ast.nodes[0]
    expect(node.body).toBe('# 메모\n내용')
    expect(node.at).toEqual({ x: 5, y: 10, w: 300, h: 200 })
    const range = node.sourceMap.objectRange
    expect(JSON.parse(source.slice(range.start.offset, range.end.offset)).id).toBe('n')
    expect(node.sourceMap.bodyEncoding).toBe('json-string')
    expect(result.value.source).toBe(source)
  })
})
