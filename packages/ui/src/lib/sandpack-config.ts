// 보안에 영향을 주는 옵션 — block JSON의 options로 override 불가
// SandpackBlock에서 항상 마지막에 spread하여 강제 적용한다.
export const BOARDMARK_SANDPACK_SECURITY_OPTIONS = {
  externalResources: [] as string[],
} as const

export const BOARDMARK_SANDPACK_DEFAULT_OPTIONS = {
  showNavigator: false,
  showTabs: true,
  editorHeight: 320,
} as const

export const SANDPACK_DEFAULT_TEMPLATE = 'react' as const

export const SANDPACK_SUPPORTED_TEMPLATES = ['react', 'react-ts'] as const

export type SandpackSupportedTemplate = (typeof SANDPACK_SUPPORTED_TEMPLATES)[number]

export function isSupportedTemplate(value: unknown): value is SandpackSupportedTemplate {
  return SANDPACK_SUPPORTED_TEMPLATES.includes(value as SandpackSupportedTemplate)
}
