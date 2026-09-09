import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { createApiClient } from '../../../packages/canvas-api/src/client'
import { submitJournaled } from './edit-journal'
import { ApiError } from '../../../packages/canvas-api/src/contracts'
import { command as validateCommand } from '../../../packages/canvas-api/src/validation'
import { parseCanvasDocument } from '../../../packages/canvas-parser/src/index'
import { exportDocumentFile, readDocumentFile } from './document-files'

const help = `Boardmark CLI — DB Markdown 공통 API
document list
document read <id>
document create --name <이름>
document import --input <board.md> [--name <이름>]
document export <id> --output <board.md>
document rename <id> --name <이름> --base-revision <읽은 버전>
node read <document-id> <node-id>
node update <document-id> <node-id> --body-file <note.md|-> --base-revision <읽은 버전>
command <document-id> --input <command.json|-> --base-revision <읽은 버전>

공통 옵션: --api <URL> --token-file <파일> --json --wait-ms <0..60000> --request-id <ID> --journal-dir <폴더>
환경: BOARDMARK_API_URL, BOARDMARK_TOKEN, BOARDMARK_TOKEN_FILE, BOARDMARK_SESSION
본문과 명령은 파일 또는 stdin(-)으로 전달합니다. 읽기 결과의 revision을 그대로 제출하세요.
종료 코드: 0 성공, 2 잘못된 요청, 3 충돌/오래된 기준, 4 인증, 5 연결/서버 실패.`

async function main() {
  const flags = new Map<string, string>()
  const positional: string[] = []
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' || args[i] === '--help') flags.set(args[i], 'true')
    else if (args[i].startsWith('--')) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${args[i]}에 값이 필요합니다.`)
      flags.set(args[i], args[++i])
    } else positional.push(args[i])
  }
  if (!positional.length || flags.has('--help')) { console.log(help); return }
  const need = (flag: string) => { const value = flags.get(flag); if (!value) throw new Error(`${flag}가 필요합니다.`); return value }
  const readInput = (path: string) => readFileSync(path === '-' ? 0 : resolve(path), 'utf8')
  const token = process.env.BOARDMARK_TOKEN ?? readFileSync(flags.get('--token-file') ?? process.env.BOARDMARK_TOKEN_FILE ?? '.boardmark/access-token', 'utf8').trim()
  const connection = { url: flags.get('--api') ?? process.env.BOARDMARK_API_URL ?? 'http://127.0.0.1:4317/api', token, session: process.env.BOARDMARK_SESSION ?? randomUUID() }
  const client = createApiClient(connection)
  const [area, action, docId, nodeId] = positional
  const requestId = flags.get('--request-id') ?? randomUUID()
  const baseRevision = () => { const value = Number(need('--base-revision')); if (!Number.isSafeInteger(value) || value < 1) throw new Error('--base-revision은 읽기 결과의 양의 정수여야 합니다.'); return value }
  const controller = new AbortController()
  process.once('SIGINT', () => controller.abort(new Error('취소됨')))
  const submit = (id: string, command: unknown) => {
    const waitMs = Number(flags.get('--wait-ms') ?? 0)
    if (!Number.isFinite(waitMs) || waitMs < 0 || waitMs > 60_000) throw new Error('--wait-ms 범위는 0..60000입니다.')
    return submitJournaled(connection, flags.get('--journal-dir') ?? '.boardmark/requests', id, { command: validateCommand(command), baseRevision: baseRevision(), requestId, waitMs, signal: controller.signal })
  }
  let result: unknown
  if (area === 'document' && action === 'list') result = await client.list()
  else if (area === 'document' && action === 'read') result = await client.read(docId)
  else if (area === 'document' && action === 'create') result = await client.create({ requestId, name: need('--name'), markdown: '---\ntype: canvas\nversion: 2\n---\n' })
  else if (area === 'document' && action === 'import') {
    const bundle = readDocumentFile(need('--input'))
    result = await client.create({ requestId, name: flags.get('--name') ?? bundle.name, markdown: bundle.markdown, assets: bundle.assets })
  }
  else if (area === 'document' && action === 'export') {
    const bundle = await client.bundle(docId)
    const output = resolve(need('--output'))
    result = { documentId: docId, files: exportDocumentFile(output, bundle) }
  } else if (area === 'document' && action === 'rename') result = await client.rename(docId, { requestId, name: need('--name'), baseRevision: baseRevision() })
  else if (area === 'node' && action === 'read') {
    const doc = await client.read(docId)
    const parsed = parseCanvasDocument(doc.markdown)
    if (parsed.isErr()) throw new Error(parsed.error.message)
    const node = parsed.value.ast.nodes.find(node => node.id === nodeId)
    if (!node) throw new Error(`노트 ${nodeId}를 찾을 수 없습니다.`)
    result = { documentId: doc.id, nodeId, revision: doc.revision, markdown: node.body ?? '', node }
  } else if (area === 'node' && action === 'update') result = await submit(docId, { kind: 'replace-object-body', objectId: nodeId, markdown: readInput(need('--body-file')) })
  else if (area === 'command') result = await submit(action, JSON.parse(readInput(need('--input'))))
  else throw new Error(`지원하지 않는 명령입니다.\n${help}`)
  if (!flags.has('--json') && area === 'document' && action === 'read') process.stdout.write((result as { markdown: string }).markdown)
  else console.log(JSON.stringify({ ok: true, value: result }))
}

main().catch((error: unknown) => {
  const data = error instanceof ApiError ? error.data : { code: 'invalid-request', message: error instanceof Error ? error.message : String(error), retryable: false }
  console.log(JSON.stringify({ ok: false, error: data }))
  process.exitCode = ['locked', 'lease-expired', 'stale-base', 'request-reused'].includes(data.code) ? 3
    : data.code === 'unauthorized' ? 4 : ['connection-failed', 'internal-error'].includes(data.code) ? 5 : 2
})
