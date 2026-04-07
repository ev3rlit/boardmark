import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { matchesEscapeKey, matchesNudgeDownKey, matchesNudgeUpKey } from '@canvas-app/keyboard/key-event-matchers'
import {
  clearPendingSourceEntry,
  moveSelectionFromBlock,
  readPendingSourceEntryPosition,
  requestSourceEntryForNode
} from '@canvas-app/components/editor/caret-navigation/editor-navigation-plugin'
import {
  RAW_BLOCK_SOURCE_ATTRIBUTE,
  SPECIAL_BLOCK_KIND_ATTRIBUTE
} from '@canvas-app/components/editor/caret-navigation/selection-state'

type RawBlockSourceKind = 'code' | 'html' | 'special'

export function buildRawBlockSourceAttributes(
  sourceKind: RawBlockSourceKind,
  specialBlockKind?: 'mermaid' | 'sandpack'
) {
  return {
    [RAW_BLOCK_SOURCE_ATTRIBUTE]: sourceKind,
    ...(specialBlockKind ? { [SPECIAL_BLOCK_KIND_ATTRIBUTE]: specialBlockKind } : {})
  }
}

export function handleRawBlockKeyDown(input: {
  event: KeyboardEvent<HTMLTextAreaElement>
  onEscapeToHost?: () => void
  onValueChange: (nextValue: string) => void
  position: number | null
  setIsEditing: (isEditing: boolean) => void
  value: string
  viewProps: Pick<NodeViewProps, 'editor'>
}) {
  const { event } = input

  if (matchesEscapeKey(event)) {
    event.preventDefault()
    input.setIsEditing(false)
    input.onEscapeToHost?.()
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()

    const textarea = event.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextValue = `${input.value.slice(0, start)}  ${input.value.slice(end)}`

    input.onValueChange(nextValue)

    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(start + 2, start + 2)
    })
    return
  }

  if (input.position === null) {
    return
  }

  if (matchesNudgeUpKey(event) && isTextareaAtStart(event.currentTarget)) {
    event.preventDefault()
    const moved = moveSelectionFromBlock(input.viewProps.editor.view, input.position, 'up')

    if (moved) {
      input.setIsEditing(false)
    }
    return
  }

  if (matchesNudgeDownKey(event) && isTextareaAtEnd(event.currentTarget)) {
    event.preventDefault()
    const moved = moveSelectionFromBlock(input.viewProps.editor.view, input.position, 'down')

    if (moved) {
      input.setIsEditing(false)
    }
  }
}

export function requestRawBlockSourceEntry(props: NodeViewProps) {
  const position = readNodePosition(props)

  if (position === null) {
    return
  }

  requestSourceEntryForNode(props.editor.view, position)
}

export function useAutoSizeTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useLayoutEffect(() => {
    const element = textareaRef.current

    if (!element) {
      return
    }

    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [textareaRef, value])
}

export function useRawBlockEditingState(input: {
  caretPosition: number
  props: NodeViewProps
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [transactionVersion, bumpTransactionVersion] = useReducer((value: number) => value + 1, 0)
  const shouldRestoreCaretRef = useRef(false)

  useEffect(() => {
    const handleTransaction = () => {
      bumpTransactionVersion()
    }

    input.props.editor.on('transaction', handleTransaction)

    return () => {
      input.props.editor.off('transaction', handleTransaction)
    }
  }, [input.props.editor])

  useEffect(() => {
    if (input.props.selected) {
      return
    }

    setIsEditing(false)
  }, [input.props.selected])

  useEffect(() => {
    const position = readNodePosition(input.props)

    if (
      !input.props.selected
      || position === null
      || readPendingSourceEntryPosition(input.props.editor.state) !== position
    ) {
      return
    }

    shouldRestoreCaretRef.current = true
    setIsEditing(true)
  }, [input.props.editor.state, input.props.selected, input.props, transactionVersion])

  useEffect(() => {
    if (!input.props.selected || !isEditing || !shouldRestoreCaretRef.current) {
      return
    }

    const textarea = input.textareaRef.current

    if (!textarea) {
      return
    }

    const timeout = window.setTimeout(() => {
      shouldRestoreCaretRef.current = false
      textarea.focus()
      textarea.setSelectionRange(input.caretPosition, input.caretPosition)
      clearPendingSourceEntry(input.props.editor.view)
    }, 0)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [
    input.caretPosition,
    input.props.editor.view,
    input.props.selected,
    input.textareaRef,
    isEditing
  ])

  return {
    isEditing,
    setIsEditing
  }
}

export function readNodePosition(props: NodeViewProps) {
  const position = props.getPos()
  return typeof position === 'number' ? position : null
}

function isTextareaAtEnd(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart === textarea.selectionEnd
    && textarea.selectionStart === textarea.value.length
}

function isTextareaAtStart(textarea: HTMLTextAreaElement) {
  return textarea.selectionStart === 0 && textarea.selectionEnd === 0
}
