import type {
  BuiltInRendererProps,
  CanvasObjectStyle,
  SemanticTokenKey
} from '@boardmark/canvas-domain'
import {
  resolveCanvasObjectBackgroundColor,
  resolveCanvasObjectStrokeColor
} from '@boardmark/canvas-domain'

function readTokenVar(token: SemanticTokenKey, fallback: string) {
  return `var(--${token.replace(/\./g, '-')}, ${fallback})`
}

export function readObjectBackground(
  component: string,
  fallback: string,
  style: CanvasObjectStyle | undefined
): string {
  return resolveCanvasObjectBackgroundColor(component, style) ?? fallback
}

export function readTextColor(fallback = '#2b3437') {
  return readTokenVar('color.text.primary', fallback)
}

export function readStrokeColor(
  component: string,
  style: CanvasObjectStyle | undefined
) {
  return resolveCanvasObjectStrokeColor(component, style)
}

export function rendererFrameStyle(
  props: BuiltInRendererProps,
  borderRadius: string,
  ambientShadow: string
) {
  const stroke = readStrokeColor(props.component, props.style)
  const boxShadow = stroke
    ? `${ambientShadow}, inset 0 0 0 1.5px ${stroke}`
    : ambientShadow

  return {
    width: props.width ?? '100%',
    minHeight: props.height ?? 120,
    background: readObjectBackground(props.component, '#ffffff', props.style),
    color: readTextColor(),
    borderRadius,
    boxShadow
  }
}
