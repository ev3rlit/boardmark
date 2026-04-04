export async function readDroppedFileText(file: File) {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Response(file).text()
}

export function isCanvasMarkdownFile(file: File) {
  return /\.canvas\.md$|\.md$/i.test(file.name)
}

export function readClipboardImageFile(event: ClipboardEvent) {
  const items = event.clipboardData?.items ?? []

  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()

      if (file) {
        return file
      }
    }
  }

  return null
}

export function insertTextAtSelection(target: HTMLTextAreaElement, text: string) {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start
  const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`
  const nextCursor = start + text.length

  target.value = nextValue
  target.setSelectionRange(nextCursor, nextCursor)
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

export async function pickImageFileFromDocument(rootDocument: Document) {
  if (!rootDocument.body) {
    return null
  }

  const input = rootDocument.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.hidden = true
  rootDocument.body.appendChild(input)

  return new Promise<File | null>((resolve) => {
    const finish = (file: File | null) => {
      input.remove()
      resolve(file)
    }

    input.addEventListener('change', () => {
      finish(input.files?.[0] ?? null)
    }, { once: true })
    input.click()
  })
}

export function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

export function readSelectionLabel(
  selectedGroupCount: number,
  selectedNodeCount: number,
  selectedEdgeCount: number
) {
  const totalSelected = selectedGroupCount + selectedNodeCount + selectedEdgeCount

  if (totalSelected <= 1) {
    if (selectedEdgeCount === 1) {
      return 'connector'
    }

    if (selectedGroupCount === 1) {
      return 'group'
    }

    return 'object'
  }

  return `${totalSelected} items`
}
