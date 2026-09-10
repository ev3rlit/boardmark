import { defaultSchema, type Options } from 'rehype-sanitize'

// Keep authored CSS local to content layout. No positioning, URL values,
// custom properties, or executable CSS; unsupported declarations reject style.
const layoutProperties = [
  'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'gap', 'column-gap', 'row-gap', 'align-items', 'align-self', 'justify-content',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'overflow', 'overflow-x', 'overflow-y', 'object-fit', 'box-sizing', 'white-space', 'text-align'
]
const layoutStyle = new RegExp(
  `^\\s*(?:(?:${layoutProperties.join('|')})\\s*:\\s*[a-z0-9.% ,/+-]+\\s*(?:;\\s*|$))+$`,
  'i'
)

export const markdownHtmlSchema: Options = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), ['style', layoutStyle]]
  },
  protocols: {
    ...defaultSchema.protocols,
    // The renderer validates asset hashes before passing them to the resolver.
    src: [...(defaultSchema.protocols?.src ?? []), 'asset']
  }
}
