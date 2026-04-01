import type {
  BuiltInPalette,
  BuiltInRendererProps,
  BuiltInTone,
  SemanticTokenKey
} from '@boardmark/canvas-domain'

const paletteToToken: Record<BuiltInPalette, SemanticTokenKey> = {
  neutral: 'color.object.neutral',
  amber: 'color.object.amber',
  blue: 'color.object.blue',
  green: 'color.object.green',
  violet: 'color.object.violet',
  rose: 'color.object.rose'
}

function readTokenVar(token: SemanticTokenKey, fallback: string) {
  return `var(--${token.replace(/\./g, '-')}, ${fallback})`
}

function resolvePaletteBackground(
  palette: BuiltInPalette,
  fallback: string
): string {
  const legacyFallbackByPalette: Record<BuiltInPalette, string> = {
    neutral: `var(--note-default, ${fallback})`,
    amber: `var(--note-yellow, ${fallback})`,
    blue: `var(--note-blue, ${fallback})`,
    green: `var(--note-green, ${fallback})`,
    violet: `var(--note-purple, ${fallback})`,
    rose: `var(--note-pink, ${fallback})`
  }

  return readTokenVar(paletteToToken[palette], legacyFallbackByPalette[palette])
}

export function readObjectBackground(
  palette: BuiltInPalette | undefined,
  tone: BuiltInTone | undefined,
  fallback: string
): string {
  const base = resolvePaletteBackground(palette ?? 'neutral', fallback)
  const surfaceLowest = readTokenVar('color.surface.lowest', '#ffffff')
  const surfaceLow = readTokenVar('color.surface.low', '#f1f4f6')
  const textPrimary = readTokenVar('color.text.primary', '#2b3437')
  const accentSoft = readTokenVar('color.accent.soft', '#f2edff')

  switch (tone) {
    case 'soft':
      return `color-mix(in oklab, ${base} 72%, ${surfaceLowest} 28%)`
    case 'muted':
      return `color-mix(in oklab, ${base} 56%, ${surfaceLow} 44%)`
    case 'strong':
      return `color-mix(in oklab, ${base} 88%, ${textPrimary} 12%)`
    case 'accent':
      return `color-mix(in oklab, ${base} 78%, ${accentSoft} 22%)`
    default:
      return base
  }
}

export function rendererFrameStyle<TData>(
  props: BuiltInRendererProps<TData>,
  palette: BuiltInPalette | undefined,
  tone: BuiltInTone | undefined,
  fallback: string,
  borderRadius: string
) {
  return {
    width: props.width ?? '100%',
    minHeight: props.height ?? 120,
    background: readObjectBackground(palette, tone, fallback),
    color: readTokenVar('color.text.primary', '#2b3437'),
    borderRadius
  }
}
