import type { SandpackSourceSerializer } from './sandpack-source-serializer'

export const sandpackJsonSourceSerializer: SandpackSourceSerializer = {
  format: 'json',
  serialize(document) {
    const serializedFiles = Object.fromEntries(document.files.map((file) => {
      const flags = {
        ...(file.active ? { active: true } : {}),
        ...(file.hidden ? { hidden: true } : {}),
        ...(file.readOnly ? { readOnly: true } : {})
      }

      return [
        file.name,
        Object.keys(flags).length === 0
          ? file.code
          : {
              code: file.code,
              ...flags
            }
      ]
    }))

    const json = JSON.stringify({
      template: document.template,
      files: serializedFiles,
      ...(document.dependencies ? { dependencies: document.dependencies } : {}),
      ...(document.layout === 'code' ? { options: { showEditor: true } } : {}),
      ...(document.readOnly ? { readOnly: true } : {})
    }, null, 2)

    return `\`\`\`sandpack\n${json}\n\`\`\`\n`
  }
}
