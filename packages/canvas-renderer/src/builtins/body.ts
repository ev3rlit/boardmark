import { load } from 'js-yaml'

type BuiltInBodyBlock = {
  format: string
  rangeEnd: number
  rangeStart: number
  role?: string
  source: string
}

type BuiltInBodyParts = {
  blocks: BuiltInBodyBlock[]
  prose: string
}

export function readBuiltInBodyParts(body: string | undefined): BuiltInBodyParts {
  if (!body) {
    return {
      blocks: [],
      prose: ''
    }
  }

  const blockPattern = /(^|\n)(```|~~~)([^\n]*)\n([\s\S]*?)\n\2(?=\n|$)/g
  const blocks: BuiltInBodyBlock[] = []
  let prose = ''
  let cursor = 0

  for (const match of body.matchAll(blockPattern)) {
    const blockStart = (match.index ?? 0) + (match[1]?.length ?? 0)
    const blockEnd = blockStart + match[0].length - (match[1]?.length ?? 0)
    const info = (match[3] ?? '').trim().split(/\s+/).filter(Boolean)

    prose += body.slice(cursor, blockStart)
    cursor = blockEnd

    blocks.push({
      format: info[0] ?? '',
      role: info[1],
      source: match[4] ?? '',
      rangeStart: blockStart,
      rangeEnd: blockEnd
    })
  }

  prose += body.slice(cursor)

  return {
    blocks,
    prose: prose.trim(),
  }
}

export function readBuiltInBodyLabel(body: string | undefined): string | undefined {
  const { prose } = readBuiltInBodyParts(body)
  return prose.length > 0 ? prose : undefined
}

export function readBuiltInBodyProps<TProps extends Record<string, unknown>>(
  body: string | undefined
): Partial<TProps> {
  const propsBlock = readBuiltInBodyParts(body).blocks.find((block) => {
    return block.role === 'props' && (block.format === 'yaml' || block.format === 'json')
  })

  if (!propsBlock) {
    return {}
  }

  try {
    const parsed = propsBlock.format === 'json' ? JSON.parse(propsBlock.source) : load(propsBlock.source)

    if (!isRecord(parsed)) {
      return {}
    }

    return parsed as Partial<TProps>
  } catch {
    return {}
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
