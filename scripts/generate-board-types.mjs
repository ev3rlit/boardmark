import { compileFromFile } from 'json-schema-to-typescript'
import { readFile, writeFile } from 'node:fs/promises'
import Ajv from 'ajv'
import standaloneCode from 'ajv/dist/standalone/index.js'

const target = 'packages/canvas-domain/src/board-file.generated.ts'
const source = await compileFromFile('schemas/boardmark.schema.json', {
  bannerComment:
    '// Generated from schemas/boardmark.schema.json. Run pnpm generate:board-types; do not edit.',
  style: { singleQuote: true, semi: false, tabWidth: 2 }
})
const schema = JSON.parse(await readFile('schemas/boardmark.schema.json', 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: true, code: { source: true, esm: true } })
const validator =
  '// Generated from schemas/boardmark.schema.json. Do not edit.\n' +
  standaloneCode(ajv, ajv.compile(schema))
    .replace('require("ajv/dist/runtime/ucs2length").default', 'ucs2length')
    .replace('require("ajv/dist/runtime/equal").default', 'equal')
const validatorSource =
  'import ucs2length from "ajv/dist/runtime/ucs2length.js";\nimport equal from "ajv/dist/runtime/equal.js";\n' +
  validator
if (/\brequire\(/.test(validatorSource))
  throw new Error('Generated validator needs another explicit ESM runtime import.')
for (const [file, content] of [
  [target, source],
  ['packages/canvas-domain/src/board-validator.generated.js', validatorSource]
]) {
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      throw new Error('Board types differ from the schema. Run corepack pnpm generate:board-types.')
    }
  } else {
    await writeFile(file, content)
  }
}
