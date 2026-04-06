import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WysiwygPhase0Spike } from './wysiwyg-phase0-spike'

const { highlightCodeBlockMock } = vi.hoisted(() => ({
  highlightCodeBlockMock: vi.fn()
}))

vi.mock('@boardmark/ui', async () => {
  const actual = await vi.importActual<typeof import('@boardmark/ui')>('@boardmark/ui')

  return {
    ...actual,
    MarkdownContent: ({ content }: { content: string }) => (
      <div data-testid="markdown-content">{content}</div>
    ),
    highlightCodeBlock: highlightCodeBlockMock
  }
})

describe('WysiwygPhase0Spike', () => {
  beforeEach(() => {
    highlightCodeBlockMock.mockResolvedValue({
      kind: 'plain',
      lines: ['placeholder'],
      theme: 'plain'
    })
  })

  it('toggles special fenced blocks between preview and source mode', async () => {
    const user = userEvent.setup()

    render(<WysiwygPhase0Spike />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sample document' }), 'special-fallback')
    await user.click(screen.getAllByRole('button', { name: 'Edit source' })[0]!)

    const textarea = screen.getByRole('textbox', { name: 'mermaid source' })
    expect(textarea).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'mermaid source' })).toBeNull()
    })
  })

  it('supports tab indentation inside the custom code block textarea and shows line numbers', async () => {
    const user = userEvent.setup()
    const { container } = render(<WysiwygPhase0Spike />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sample document' }), 'code-table')

    const textarea = await screen.findByRole('textbox', { name: 'Code block source' }) as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(0, 0)
    fireEvent.keyDown(textarea, { key: 'Tab', code: 'Tab' })

    await waitFor(() => {
      expect(textarea.value.startsWith('  export function indent')).toBe(true)
    })

    expect(container.querySelectorAll('.wysiwyg-phase0-code-block__gutter span')).toHaveLength(3)
  })

  it('adds a table row through the spike actions and updates serialized markdown', async () => {
    const user = userEvent.setup()

    render(<WysiwygPhase0Spike />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sample document' }), 'code-table')
    await user.click(screen.getByRole('button', { name: 'Add Row' }))

    const markdownOutput = screen.getByText((_, element) => {
      return element?.tagName === 'CODE' && element.textContent?.includes('| Capability') === true
    })

    await waitFor(() => {
      const tableLines = markdownOutput.textContent
        ?.split('\n')
        .filter((line) => line.startsWith('|'))

      expect(tableLines?.length).toBe(5)
    })
  })
})
