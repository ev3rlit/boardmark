export type KeyEventLike = Pick<
  KeyboardEvent,
  'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>

export type WheelZoomEventLike = Pick<
  WheelEvent,
  'altKey' | 'ctrlKey' | 'deltaY' | 'metaKey'
>

export type GestureZoomEventLike = {
  scale: number
}

export function matchesDeleteSelectionKey(event: KeyEventLike) {
  return event.key === 'Delete' || event.key === 'Backspace'
}

export function matchesCopySelectionKey(event: KeyEventLike) {
  return matchesModChord(event, 'c') && !event.shiftKey
}

export function matchesCutSelectionKey(event: KeyEventLike) {
  return matchesModChord(event, 'x') && !event.shiftKey
}

export function matchesDuplicateSelectionKey(event: KeyEventLike) {
  return matchesModChord(event, 'd') && !event.shiftKey
}

export function matchesEscapeKey(event: KeyEventLike) {
  return event.key === 'Escape'
}

export function matchesNudgeDownKey(event: KeyEventLike) {
  return event.key === 'ArrowDown' && !(event.metaKey || event.ctrlKey || event.altKey)
}

export function matchesNudgeLeftKey(event: KeyEventLike) {
  return event.key === 'ArrowLeft' && !(event.metaKey || event.ctrlKey || event.altKey)
}

export function matchesNudgeRightKey(event: KeyEventLike) {
  return event.key === 'ArrowRight' && !(event.metaKey || event.ctrlKey || event.altKey)
}

export function matchesNudgeUpKey(event: KeyEventLike) {
  return event.key === 'ArrowUp' && !(event.metaKey || event.ctrlKey || event.altKey)
}

export function matchesRedoKey(event: KeyEventLike) {
  return (matchesModChord(event, 'z') && event.shiftKey) || matchesModChord(event, 'y')
}

export function matchesSelectAllKey(event: KeyEventLike) {
  return matchesModChord(event, 'a') && !event.shiftKey
}

export function matchesPasteSelectionKey(event: KeyEventLike) {
  return matchesModChord(event, 'v') && !event.shiftKey
}

export function matchesPasteInPlaceKey(event: KeyEventLike) {
  return matchesModChord(event, 'v') && event.shiftKey
}

export function matchesSpaceKey(event: KeyEventLike) {
  return event.code === 'Space'
}

export function matchesUndoKey(event: KeyEventLike) {
  return matchesModChord(event, 'z') && !event.shiftKey
}

export function matchesZoomInKey(event: KeyEventLike) {
  if (!matchesModShortcut(event)) {
    return false
  }

  return event.key === '=' || event.key === '+'
}

export function matchesZoomOutKey(event: KeyEventLike) {
  return matchesModShortcut(event) && event.key === '-'
}

export function readZoomDirectionFromWheelEvent(event: WheelZoomEventLike): 'in' | 'out' | null {
  if (!event.ctrlKey || event.altKey || event.metaKey || event.deltaY === 0) {
    return null
  }

  return event.deltaY < 0 ? 'in' : 'out'
}

export function readZoomDirectionFromGestureEvent(input: {
  current: GestureZoomEventLike
  previousScale: number
}): 'in' | 'out' | null {
  if (!Number.isFinite(input.current.scale) || input.current.scale <= 0) {
    return null
  }

  const scaleDelta = input.current.scale / input.previousScale

  if (scaleDelta >= 1.04) {
    return 'in'
  }

  if (scaleDelta <= 0.96) {
    return 'out'
  }

  return null
}

function matchesModChord(event: KeyEventLike, key: string) {
  if (!matchesModShortcut(event)) {
    return false
  }

  return event.key.toLowerCase() === key.toLowerCase()
}

function matchesModShortcut(event: KeyEventLike) {
  return (event.metaKey || event.ctrlKey) && !event.altKey
}
