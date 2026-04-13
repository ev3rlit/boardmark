import type { MermaidConfig } from 'mermaid'

export type MermaidRenderResult = {
  svg: string
}

const BOARDMARK_MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  fontFamily: 'Manrope, sans-serif',
  htmlLabels: false,
  flowchart: {
    useMaxWidth: false
  },
  themeVariables: {
    background: '#ffffff',
    primaryColor: '#e6deff',
    primaryBorderColor: '#6042d6',
    primaryTextColor: '#2b3437',
    secondaryColor: '#f1f4f6',
    tertiaryColor: '#f8f9fa',
    lineColor: '#586064',
    textColor: '#2b3437'
  }
} satisfies MermaidConfig

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null

export async function renderMermaidDiagram(
  source: string,
  id: string
): Promise<MermaidRenderResult> {
  const mermaid = await loadMermaid()
  const { svg } = await mermaid.render(id, source)

  return { svg }
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = Promise.all([
      import('mermaid'),
      import('@iconify-json/logos'),
      import('@iconify-json/mdi'),
    ])
      .then(([module, logos, mdi]) => {
        const mermaid = module.default
        mermaid.initialize(BOARDMARK_MERMAID_CONFIG)
        mermaid.registerIconPacks([
          { name: 'logos', icons: logos.icons },
          { name: 'mdi', icons: mdi.icons },
        ])
        return mermaid
      })
      .catch((error) => {
        mermaidPromise = null
        throw error
      })
  }

  return mermaidPromise
}
