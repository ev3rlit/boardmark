import { lazy } from 'react'
import type { ComponentType } from 'react'

export type FencedBlockRenderer = ComponentType<{ source: string }>

// NOTE(ADR-001): Option B — 정적 레지스트리.
// 최종 목표는 Option D (React Context 레지스트리)로의 전환.
// 전환 트리거: web/desktop 렌더러 집합 분기, 렌더러 5개 초과, 앱 레벨 lazy 제어 필요 시.
const registry: Record<string, ReturnType<typeof lazy<FencedBlockRenderer>>> = {
  mermaid: lazy(() =>
    import('../mermaid-diagram').then((m) => ({ default: m.MermaidDiagram }))
  ),
}

export function getFencedBlockRenderer(
  language: string
): ReturnType<typeof lazy<FencedBlockRenderer>> | undefined {
  return registry[language]
}
