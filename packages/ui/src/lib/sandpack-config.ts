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
export const BOARDMARK_SANDPACK_SNAPSHOT_HELPER_FILE = '__boardmark-snapshot.js' as const
export const BOARDMARK_SANDPACK_INTERNAL_DEPENDENCIES = {
  'html2canvas': '^1.4.1'
} as const

export const SANDPACK_SUPPORTED_TEMPLATES = ['react', 'react-ts'] as const

export type SandpackSupportedTemplate = (typeof SANDPACK_SUPPORTED_TEMPLATES)[number]

export function isSupportedTemplate(value: unknown): value is SandpackSupportedTemplate {
  return SANDPACK_SUPPORTED_TEMPLATES.includes(value as SandpackSupportedTemplate)
}

// 컨텐츠 높이를 부모에게 전달하는 index.js — blockId로 스코프를 분리한다.
export function generateResizeIndex(blockId: string): string {
  return [
    `import "./${BOARDMARK_SANDPACK_SNAPSHOT_HELPER_FILE}";`,
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

export function generateSandpackSnapshotHelper(): string {
  return [
    'import html2canvas from "html2canvas";',
    '',
    'const SNAPSHOT_REQUEST = "boardmark:snapshot-request";',
    'const SNAPSHOT_RESPONSE = "boardmark:snapshot-response";',
    '// NOTE(boardmark): selection export currently captures the outer Sandpack shell',
    '// but still misses the live preview body in some runtimes. This helper keeps',
    '// the snapshot attempt inside the preview iframe so later fixes can stay local.',
    '',
    'function readRootElement() {',
    '  return document.getElementById("root") ?? document.body ?? document.documentElement;',
    '}',
    '',
    'function readCaptureWidth(element) {',
    '  const rect = element.getBoundingClientRect();',
    '  return Math.max(1, Math.ceil(rect.width), Math.ceil(element.scrollWidth || 0), Math.ceil(element.clientWidth || 0));',
    '}',
    '',
    'function readCaptureHeight(element) {',
    '  const rect = element.getBoundingClientRect();',
    '  return Math.max(1, Math.ceil(rect.height), Math.ceil(element.scrollHeight || 0), Math.ceil(element.clientHeight || 0));',
    '}',
    '',
    'function readBackgroundColor() {',
    '  const root = readRootElement();',
    '  const rootBackground = window.getComputedStyle(root).backgroundColor;',
    '  if (rootBackground && rootBackground !== "rgba(0, 0, 0, 0)") return rootBackground;',
    '  const bodyBackground = document.body ? window.getComputedStyle(document.body).backgroundColor : "";',
    '  if (bodyBackground && bodyBackground !== "rgba(0, 0, 0, 0)") return bodyBackground;',
    '  const documentBackground = window.getComputedStyle(document.documentElement).backgroundColor;',
    '  if (documentBackground && documentBackground !== "rgba(0, 0, 0, 0)") return documentBackground;',
    '  return "#ffffff";',
    '}',
    '',
    'async function captureSnapshot() {',
    '  const root = readRootElement();',
    '  const width = readCaptureWidth(root);',
    '  const height = readCaptureHeight(root);',
    '  const canvas = await html2canvas(root, {',
    '    backgroundColor: readBackgroundColor(),',
    '    height,',
    '    logging: false,',
    '    scale: 1,',
    '    useCORS: true,',
    '    width,',
    '    windowWidth: width,',
    '    windowHeight: height,',
    '  });',
    '  const dataUrl = canvas.toDataURL("image/png");',
    '  return { dataUrl, width, height };',
    '}',
    '',
    'window.addEventListener("message", (event) => {',
    '  const data = event.data;',
    '  if (!data || data.type !== SNAPSHOT_REQUEST) return;',
    '  Promise.resolve()',
    '    .then(captureSnapshot)',
    '    .then((result) => {',
    '      window.parent.postMessage({',
    '        type: SNAPSHOT_RESPONSE,',
    '        requestId: data.requestId,',
    '        dataUrl: result.dataUrl,',
    '        width: result.width,',
    '        height: result.height,',
    '      }, "*");',
    '    })',
    '    .catch((error) => {',
    '      window.parent.postMessage({',
    '        type: SNAPSHOT_RESPONSE,',
    '        requestId: data.requestId,',
    '        error: error instanceof Error ? error.message : String(error),',
    '      }, "*");',
    '    });',
    '});',
  ].join('\n')
}
