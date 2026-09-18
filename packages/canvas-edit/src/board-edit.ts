import {
  validateBoard,
  type BoardFile,
  type BoardItem,
  type BoardResult
} from '../../canvas-domain/src/board-file'
import type { CanvasDocumentEditIntent } from './edit-intents'
import type { CanvasClipboardNode } from './edit-types'
import type { CanvasObjectStyle } from '../../canvas-domain/src/index'

// Same user commands as the whiteboard, applied to JSON-owned objects, never Markdown patches.
export function editBoard(
  input: BoardFile,
  intent: CanvasDocumentEditIntent
): BoardResult<BoardFile> {
  const board = structuredClone(input)
  const all = () => [...board.items, ...board.connections, ...(board.groups ?? [])]
  const nextId = (prefix: string) => {
    const ids = new Set(all().map((item) => item.id))
    let index = 1
    while (ids.has(`${prefix}-${index}`)) index++
    return `${prefix}-${index}`
  }
  const item = (id: string) => {
    const value = board.items.find((item) => item.id === id)
    if (!value) throw Error(`항목 "${id}"가 없습니다.`)
    return value
  }
  const edge = (id: string) => {
    const value = board.connections.find((edge) => edge.id === id)
    if (!value) throw Error(`연결선 "${id}"가 없습니다.`)
    return value
  }
  const remove = (nodes: string[], edges: string[], groups: string[] = []) => {
    const removed = new Set(nodes)
    board.items = board.items.filter((item) => !removed.has(item.id))
    board.connections = board.connections.filter(
      (edge) => !edges.includes(edge.id) && !removed.has(edge.source) && !removed.has(edge.target)
    )
    if (board.groups)
      board.groups = board.groups
        .filter((group) => !groups.includes(group.id))
        .map((group) => ({ ...group, items: group.items.filter((id) => !removed.has(id)) }))
        .filter((group) => group.items.length > 0)
  }
  try {
    switch (intent.kind) {
      case 'create-note':
        board.items.push({
          id: nextId('note'),
          kind: 'markdown',
          content: intent.markdown,
          frame: frame(intent),
          autoHeight: true
        })
        break
      case 'create-shape': {
        const value: unknown = {
          id: nextId('shape'),
          kind: 'shape',
          component: intent.component,
          content: intent.body,
          frame: frame(intent)
        }
        const checked = validateBoard({ ...board, items: [...board.items, value] })
        if (!checked.ok) return checked
        return checked
      }
      case 'create-image':
        board.items.push({
          id: intent.id,
          kind: 'image',
          frame: frame(intent),
          reference: { kind: 'file', path: intent.src },
          alt: intent.alt,
          title: intent.title,
          lockAspectRatio: intent.lockAspectRatio
        })
        break
      case 'replace-object-body': {
        const target = item(intent.objectId)
        if (target.kind === 'image') throw Error('이미지는 메모 본문을 소유하지 않습니다.')
        target.content = intent.markdown
        break
      }
      case 'move-node':
        Object.assign(item(intent.nodeId).frame, { x: intent.x, y: intent.y })
        break
      case 'move-nodes':
        for (const move of intent.moves)
          Object.assign(item(move.nodeId).frame, { x: move.x, y: move.y })
        break
      case 'nudge-objects':
        for (const id of intent.nodeIds) {
          item(id).frame.x += intent.dx
          item(id).frame.y += intent.dy
        }
        break
      case 'resize-node': {
        const target = item(intent.nodeId)
        target.frame = frame(intent)
        if (target.kind === 'markdown') target.autoHeight = intent.preserveAutoHeight ?? false
        break
      }
      case 'reset-node-height': {
        const target = item(intent.nodeId)
        if (target.kind === 'markdown') target.autoHeight = true
        break
      }
      case 'set-node-style-color':
        for (const id of intent.nodeIds) {
          const target = item(id)
          target.style = { ...target.style, [intent.target]: { color: intent.color } }
        }
        break
      case 'replace-image-source': {
        const target = item(intent.nodeId)
        if (target.kind !== 'image') throw Error('이미지 항목을 선택하세요.')
        target.reference.path = intent.src
        target.alt = intent.alt
        target.title = intent.title
        break
      }
      case 'update-image-metadata': {
        const target = item(intent.nodeId)
        if (target.kind !== 'image') throw Error('이미지 항목을 선택하세요.')
        for (const key of ['alt', 'title', 'lockAspectRatio'] as const) {
          if (intent[key] !== undefined) Object.assign(target, { [key]: intent[key] })
        }
        break
      }
      case 'create-edge':
        board.connections.push({
          id: nextId('edge'),
          source: intent.from,
          target: intent.to,
          content: intent.markdown
        })
        break
      case 'update-edge-endpoints':
        Object.assign(edge(intent.edgeId), { source: intent.from, target: intent.to })
        break
      case 'replace-edge-body':
        edge(intent.edgeId).content = intent.markdown
        break
      case 'delete-node':
        remove([intent.nodeId], [])
        break
      case 'delete-edge':
        remove([], [intent.edgeId])
        break
      case 'delete-objects':
        remove(intent.nodeIds, intent.edgeIds, intent.groupIds)
        break
      case 'delete-groups':
        if (board.groups)
          board.groups = board.groups.filter((group) => !intent.groupIds.includes(group.id))
        break
      case 'upsert-group': {
        const ids = new Set(intent.nodeIds)
        board.groups = (board.groups ?? [])
          .filter((group) => group.id !== intent.groupId)
          .map((group) => ({ ...group, items: group.items.filter((id) => !ids.has(id)) }))
          .filter((group) => group.items.length)
        board.groups.push({
          id: intent.groupId,
          items: intent.nodeIds,
          z: intent.z,
          locked: intent.locked
        })
        break
      }
      case 'set-objects-locked': {
        const ids = new Set([...intent.nodeIds, ...intent.edgeIds, ...(intent.groupIds ?? [])])
        for (const entry of all()) if (ids.has(entry.id)) entry.locked = intent.locked
        break
      }
      case 'arrange-objects': {
        const ids = new Set([...intent.nodeIds, ...intent.edgeIds, ...(intent.groupIds ?? [])])
        const entries = all().sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
        if (intent.mode === 'bring-to-front')
          entries.sort((a, b) => Number(ids.has(a.id)) - Number(ids.has(b.id)))
        else if (intent.mode === 'send-to-back')
          entries.sort((a, b) => Number(ids.has(b.id)) - Number(ids.has(a.id)))
        else if (intent.mode === 'bring-forward') {
          for (let i = entries.length - 2; i >= 0; i--)
            if (ids.has(entries[i].id) && !ids.has(entries[i + 1].id))
              [entries[i], entries[i + 1]] = [entries[i + 1], entries[i]]
        } else {
          for (let i = 1; i < entries.length; i++)
            if (ids.has(entries[i].id) && !ids.has(entries[i - 1].id))
              [entries[i], entries[i - 1]] = [entries[i - 1], entries[i]]
        }
        entries.forEach((entry, index) => {
          entry.z = (index + 1) * 100
        })
        break
      }
      case 'duplicate-objects': {
        const mapping = new Map<string, string>()
        for (const id of intent.nodeIds) {
          const copy = structuredClone(item(id))
          copy.id = nextId(copy.kind === 'markdown' ? 'note' : copy.kind)
          mapping.set(id, copy.id)
          copy.frame.x += intent.offsetX
          copy.frame.y += intent.offsetY
          board.items.push(copy)
        }
        for (const id of intent.edgeIds) {
          const copy = structuredClone(edge(id))
          copy.id = nextId('edge')
          copy.source = mapping.get(copy.source) ?? copy.source
          copy.target = mapping.get(copy.target) ?? copy.target
          board.connections.push(copy)
        }
        break
      }
      case 'paste-objects': {
        const mapping = new Map<string, string>()
        const dx = intent.inPlace ? 0 : intent.anchorX - (intent.payload.origin?.x ?? 0)
        const dy = intent.inPlace ? 0 : intent.anchorY - (intent.payload.origin?.y ?? 0)
        for (const node of intent.payload.nodes) {
          const copy = fromClipboard(
            node,
            nextId(
              node.component === 'note' ? 'note' : node.component === 'image' ? 'image' : 'shape'
            )
          )
          mapping.set(node.id, copy.id)
          copy.frame.x += dx
          copy.frame.y += dy
          board.items.push(copy)
        }
        for (const entry of intent.payload.edges)
          board.connections.push({
            id: nextId('edge'),
            source: mapping.get(entry.from) ?? entry.from,
            target: mapping.get(entry.to) ?? entry.to,
            content: entry.body,
            locked: entry.locked,
            z: entry.z,
            style: boardStyle(entry.style)
          })
        for (const entry of intent.payload.groups) {
          board.groups ??= []
          board.groups.push({
            id: nextId('group'),
            items: entry.members.nodeIds.map((id) => mapping.get(id) ?? id),
            z: entry.z,
            locked: entry.locked
          })
        }
        break
      }
    }
    return validateBoard(board)
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'invalid-edit',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function frame(input: { x: number; y: number; width: number; height: number }) {
  return { x: input.x, y: input.y, width: input.width, height: input.height }
}
function fromClipboard(node: CanvasClipboardNode, id: string): BoardItem {
  const common = {
    id,
    frame: { x: node.at.x, y: node.at.y, width: node.at.w ?? 320, height: node.at.h ?? 220 },
    z: node.z,
    locked: node.locked,
    style: boardStyle(node.style)
  }
  if (node.component === 'note')
    return {
      ...common,
      kind: 'markdown',
      content: node.body ?? '',
      autoHeight: node.at.h === undefined
    }
  if (node.component === 'image')
    return {
      ...common,
      kind: 'image',
      reference: { kind: 'file', path: node.src ?? '' },
      alt: node.alt,
      title: node.title,
      lockAspectRatio: node.lockAspectRatio
    }
  const checked = validateBoard({
    format: 'boardmark',
    version: 1,
    connections: [],
    items: [{ ...common, kind: 'shape', component: node.component, content: node.body ?? '' }]
  })
  if (!checked.ok) throw Error(checked.error.message)
  return checked.value.items[0]
}

function boardStyle(style: CanvasObjectStyle | undefined) {
  if (!style) return undefined
  return {
    bg: style.bg?.color ? { color: style.bg.color } : undefined,
    stroke: style.stroke?.color ? { color: style.stroke.color } : undefined
  }
}
