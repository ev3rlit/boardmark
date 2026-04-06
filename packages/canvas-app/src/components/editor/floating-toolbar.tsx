import type { Editor } from '@tiptap/react'

type FloatingToolbarProps = {
  editor: Editor | null
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  if (!editor) {
    return null
  }

  const canAddRow = editor.can().addRowAfter()
  const canAddColumn = editor.can().addColumnAfter()
  const canAlignCell = editor.can().setCellAttribute('align', 'center')
  const canToggleHeader = editor.can().toggleHeaderRow()

  return (
    <div className="canvas-wysiwyg-toolbar nodrag nopan" role="toolbar" aria-label="Formatting controls">
      <ToolbarButton
        active={editor.isActive('bold')}
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        active={editor.isActive('italic')}
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        active={editor.isActive('link')}
        label="Link"
        onClick={() => {
          const href = window.prompt('Link URL', editor.getAttributes('link').href ?? 'https://boardmark.dev')

          if (!href) {
            return
          }

          editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
        }}
      />
      <ToolbarButton
        disabled={!canAddRow}
        label="Add Row"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <ToolbarButton
        disabled={!canAddColumn}
        label="Add Column"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        disabled={!canAlignCell}
        label="Center"
        onClick={() => editor.chain().focus().setCellAttribute('align', 'center').run()}
      />
      <ToolbarButton
        disabled={!canToggleHeader}
        label="Header"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      />
    </div>
  )
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="canvas-wysiwyg-inline-button"
      data-active={active ? 'true' : 'false'}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
