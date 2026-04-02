export type KeyEventLike = Pick<
  KeyboardEvent,
  'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>

export function matchesDeleteSelectionKey(event: KeyEventLike) {
  return event.key === 'Delete' || event.key === 'Backspace'
}

export function matchesEscapeKey(event: KeyEventLike) {
  return event.key === 'Escape'
}

export function matchesRedoKey(event: KeyEventLike) {
  return (matchesModChord(event, 'z') && event.shiftKey) || matchesModChord(event, 'y')
}

export function matchesSpaceKey(event: KeyEventLike) {
  return event.code === 'Space'
}

export function matchesUndoKey(event: KeyEventLike) {
  return matchesModChord(event, 'z') && !event.shiftKey
}

function matchesModChord(event: KeyEventLike, key: string) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return false
  }

  return event.key.toLowerCase() === key.toLowerCase()
}
