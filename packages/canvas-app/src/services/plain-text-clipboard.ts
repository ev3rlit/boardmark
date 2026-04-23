export async function writePlainTextToClipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Text clipboard write is not supported in this environment.')
  }

  await navigator.clipboard.writeText(text)
}
