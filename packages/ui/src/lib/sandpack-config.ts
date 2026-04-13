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

// 컨텐츠 높이를 부모에게 전달하는 index.js — blockId로 스코프를 분리한다.
export function generateResizeIndex(blockId: string): string {
  return [
    'import React, { StrictMode } from "react";',
    'import { createRoot } from "react-dom/client";',
    'import App from "./App";',
    '',
    `const BLOCK_ID = "${blockId}";`,
    'function reportHeight() {',
    '  const root = document.getElementById("root");',
    '  const height = root ? root.getBoundingClientRect().height : document.documentElement.scrollHeight;',
    '  window.parent.postMessage(',
    '    { type: "boardmark:resize", id: BLOCK_ID, height },',
    '    "*"',
    '  );',
    '}',
    'const observer = new ResizeObserver(reportHeight);',
    'observer.observe(document.getElementById("root") ?? document.documentElement);',
    'window.addEventListener("load", reportHeight);',
    '',
    'const rootElement = document.getElementById("root");',
    'const root = createRoot(rootElement);',
    'root.render(<StrictMode><App /></StrictMode>);',
  ].join('\n')
}
