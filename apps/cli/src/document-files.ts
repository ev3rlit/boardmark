import { existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import type { DocumentBundle } from '../../../packages/canvas-api/src/contracts'
import { parseCanvasDocument } from '../../../packages/canvas-parser/src/index'

export function readDocumentFile(path: string): DocumentBundle {
  const markdown = readFileSync(path === '-' ? 0 : path, 'utf8')
  if (path.endsWith('.boardmark.json')) return readBundle(markdown)
  const sidecar = `${path}.boardmark.json`
  if (path !== '-' && existsSync(sidecar)) {
    const bundle = readBundle(readFileSync(sidecar, 'utf8'))
    return { ...bundle, markdown }
  }
  const sources = new Set<string>()
  const parsed = parseCanvasDocument(markdown)
  if (parsed.isOk()) for (const node of parsed.value.ast.nodes) if (node.src) sources.add(node.src)
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) sources.add(match[1])
  const root = path === '-' ? process.cwd() : realpathSync(dirname(resolve(path)))
  const assets = [...sources].filter(src => !/^https?:\/\//.test(src)).map(src => {
    if (src.startsWith('asset:')) throw new Error(`첨부 ${src}를 복원할 .boardmark.json 묶음이 필요합니다.`)
    const candidate = realpathSync(resolve(root, src))
    const traversal = relative(root, candidate)
    if (isAbsolute(traversal) || traversal === '..' || traversal.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error(`문서 디렉터리 밖의 첨부는 먼저 명시적으로 복사하세요: ${src}`)
    const extension = extname(candidate).toLowerCase()
    const mime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' } as Record<string, string>)[extension] ?? 'application/octet-stream'
    return { path: src, mime, base64: readFileSync(candidate).toString('base64') }
  })
  return { format: 'boardmark-bundle-v1', name: path.split(/[\\/]/).at(-1) ?? '가져온 보드', markdown, assets }
}

function readBundle(source: string): DocumentBundle {
  const value: unknown = JSON.parse(source)
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'boardmark-bundle-v1') {
    throw new Error('지원하지 않는 첨부 묶음 형식입니다.')
  }
  // The common API validates the remaining fields before any DB write.
  return value as DocumentBundle
}

export function exportDocumentFile(output: string, bundle: DocumentBundle) {
  if (output.endsWith('.boardmark.json')) {
    writeFileSync(output, JSON.stringify(bundle, null, 2), { flag: 'wx' })
    return [output]
  }
  const sidecar = `${output}.boardmark.json`
  if (existsSync(output) || (bundle.assets.length && existsSync(sidecar))) throw new Error('출력 파일이 이미 있습니다. 새 경로를 사용하세요.')
  // The sidecar is written first so a failed Markdown write leaves recoverable data.
  if (bundle.assets.length) writeFileSync(sidecar, JSON.stringify(bundle, null, 2), { flag: 'wx' })
  writeFileSync(output, bundle.markdown, { flag: 'wx' })
  return bundle.assets.length ? [output, sidecar] : [output]
}
