import type { WysiwygPhase0Sample } from './wysiwyg-phase0-types'

const sandpackSource = JSON.stringify(
  {
    template: 'react-ts',
    files: {
      '/App.tsx': [
        "export default function App() {",
        "  return <main style={{ padding: 24 }}>Boardmark spike</main>",
        "}"
      ].join('\n')
    }
  },
  null,
  2
)

export const WYSIWYG_PHASE0_SAMPLES: WysiwygPhase0Sample[] = [
  {
    id: 'baseline',
    name: 'Baseline Markdown',
    description: 'Paragraph, heading, list, blockquote, link, and inline formatting.',
    markdown: [
      '# Boardmark WYSIWYG Spike',
      '',
      'This paragraph mixes **bold**, *italic*, `inline code`, and a [link](https://boardmark.dev).',
      '',
      '> Preview and edit should stay visually close.',
      '',
      '- paragraph fidelity',
      '- semantic list editing',
      '- rich text interaction',
      '',
      '1. verify markdown in',
      '2. edit naturally',
      '3. serialize markdown out'
    ].join('\n')
  },
  {
    id: 'code-table',
    name: 'Code And Table',
    description: 'General fenced code block and markdown table behavior.',
    markdown: [
      '## Code And Table',
      '',
      '```ts',
      'export function indent(lines: string[]) {',
      "  return lines.map((line) => `  ${line}`)",
      '}',
      '```',
      '',
      '| Capability | Status | Notes |',
      '| :-- | :-: | --: |',
      '| cell editing | ready | round-trip target |',
      '| alignment | verify | markdown markers |'
    ].join('\n')
  },
  {
    id: 'special-fallback',
    name: 'Special Blocks And HTML',
    description: 'Mermaid, Sandpack, and block-local HTML fallback.',
    markdown: [
      '### Special Blocks',
      '',
      '```mermaid',
      'flowchart TD',
      '  Source[Markdown source] --> Editor[Tiptap spike]',
      '  Editor --> Output[Markdown output]',
      '```',
      '',
      '```sandpack',
      sandpackSource,
      '```',
      '',
      '<div class="boardmark-html-fallback">',
      '  <strong>HTML fallback</strong> remains block-local.',
      '</div>'
    ].join('\n')
  }
]
