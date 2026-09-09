import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { BoardDatabase } from './database'
import { createApiServer } from './http'

const dataDirectory = resolve(process.env.BOARDMARK_DATA_DIR ?? '.boardmark')
mkdirSync(dataDirectory, { recursive: true })
const tokenPath = resolve(dataDirectory, 'access-token')
if (!existsSync(tokenPath)) writeFileSync(tokenPath, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' })
const token = process.env.BOARDMARK_TOKEN ?? readFileSync(tokenPath, 'utf8').trim()
if (token.length < 32) throw new Error('BOARDMARK_TOKEN은 최소 32자여야 합니다.')
const port = Number(process.env.BOARDMARK_PORT ?? 4317)
const host = process.env.BOARDMARK_HOST ?? '127.0.0.1'
const database = new BoardDatabase(resolve(dataDirectory, 'boardmark.sqlite'))
const origins = (process.env.BOARDMARK_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(',')
const server = createApiServer({ database, token, origins })
server.listen(port, host, () => {
  console.log(`Boardmark API: http://${host}:${port}/api`)
  console.log(`접근 토큰 파일: ${tokenPath}`)
})
function stop() { server.close(() => { database.close(); process.exit(0) }) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
