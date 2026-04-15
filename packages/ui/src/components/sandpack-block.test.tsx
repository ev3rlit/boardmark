import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SandpackBlock } from './sandpack-block'

const {
  sandpackMock,
  sandpackProviderMock
} = vi.hoisted(() => ({
  sandpackMock: vi.fn(),
  sandpackProviderMock: vi.fn()
}))

vi.mock('@codesandbox/sandpack-react', () => ({
  Sandpack: (props: Record<string, unknown>) => {
    sandpackMock(props)
    return <div data-testid="sandpack-editor" />
  },
  SandpackLayout: ({ children }: { children?: ReactNode }) => (
    <div data-testid="sandpack-layout">{children}</div>
  ),
  SandpackPreview: () => <div data-testid="sandpack-preview" />,
  SandpackProvider: ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => {
    sandpackProviderMock(props)
    return <div data-testid="sandpack-provider">{children}</div>
  }
}))

describe('SandpackBlock', () => {
  it('keeps legacy JSON sandpack sources readable on the preview path', () => {
    const source = JSON.stringify({
      template: 'react',
      files: {
        'App.js': 'export default function App() {\n  return <button>Hello</button>\n}'
      }
    })

    render(<SandpackBlock source={source} />)

    expect(screen.getByTestId('sandpack-provider')).toBeInTheDocument()
    expect(screen.getByTestId('sandpack-preview')).toBeInTheDocument()
    expect(screen.queryByTestId('sandpack-editor')).toBeNull()

    expect(sandpackProviderMock).toHaveBeenCalledWith(expect.objectContaining({
      customSetup: {
        dependencies: {}
      },
      template: 'react'
    }))
  })

  it('reads nested fenced sandpack sources with inline options and uses the code layout', () => {
    render(
      <SandpackBlock
        meta='{"template":"react-ts","layout":"code","readOnly":true,"dependencies":{"@radix-ui/react-dialog":"^1.1.0"}}'
        source={`\`\`\`App.js
export default function App() {
  return <button>Hello</button>
}
\`\`\``}
      />
    )

    expect(screen.getByTestId('sandpack-editor')).toBeInTheDocument()

    expect(sandpackMock).toHaveBeenCalledWith(expect.objectContaining({
      customSetup: {
        dependencies: {
          '@radix-ui/react-dialog': '^1.1.0'
        }
      },
      options: expect.objectContaining({
        readOnly: true
      }),
      template: 'react-ts'
    }))
  })

  it('renders an error card when no registered sandpack parser can read the source', () => {
    render(<SandpackBlock source="not a valid sandpack source" />)

    expect(screen.getByRole('group', { name: 'Sandpack block render error' })).toBeInTheDocument()
    expect(screen.getByText('Unsupported sandpack source format.')).toBeInTheDocument()
  })
})
