import { useEffect, useRef, type MutableRefObject } from 'react'
import { useStore } from 'zustand'
import type { CanvasStore } from '@canvas-app/store/canvas-store'
import { isNodeLocked } from '@canvas-app/store/canvas-object-selection'
import type { CanvasNodeGeometryDraft } from './flow/flow-node-adapters'

// Pointer previews are optimistic and never mutate the document. The movement
// threshold requests authority; dropping commits only after approval. Cancellation
// detaches the gesture so a late approval cannot commit it or clear a newer preview.
export function useManagedGeometry(root: MutableRefObject<HTMLDivElement | null>, store: CanvasStore, preview: (drafts: Record<string, CanvasNodeGeometryDraft>) => void) {
  const authority = useStore(store, state => state.interactionAuthority)
  const previewRef = useRef(preview)
  previewRef.current = preview
  useEffect(() => {
    const element = root.current
    if (!element || !authority) return
    type Gesture = {
      pointer: number; x: number; y: number; latestX: number; latestY: number; zoom: number; ready: boolean; requested: boolean
      phase: 'dragging' | 'settling' | 'committing'; approval: Promise<boolean> | null
      direction: string[]; initial: Record<string, CanvasNodeGeometryDraft>; draft: Record<string, CanvasNodeGeometryDraft>
    }
    let gesture: Gesture | null = null
    let finishing = false
    let suppressClick = false
    const clear = async (current: Gesture) => {
      if (gesture !== current) return
      gesture = null
      finishing = true
      try { previewRef.current({}); await authority.finish() }
      finally { finishing = false; store.getState().setPointerInteractionState({ status: 'idle' }) }
    }
    const finish = async (commit: boolean) => {
      const current = gesture
      if (!current) return
      if (!current.requested) { gesture = null; return }
      if (!commit) { if (current.phase !== 'committing') await clear(current); return }
      if (current.phase !== 'dragging') return
      current.phase = 'settling'
      try {
        const allowed = await current.approval
        if (gesture === current && allowed && authority.isHeld(Object.keys(current.initial))) {
          current.phase = 'committing'
          if (current.direction.length) {
            const [id, geometry] = Object.entries(current.draft)[0]
            await store.getState().commitNodeResize(id, geometry)
          } else {
            await store.getState().commitNodeMoves(Object.entries(current.draft).map(([nodeId, geometry]) => ({ nodeId, x: geometry.x, y: geometry.y })))
          }
        }
      } finally {
        await clear(current)
      }
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || gesture || finishing || !(event.target instanceof Element)) return
      const state = store.getState()
      if (state.toolMode !== 'select' || state.editingState.status !== 'idle' || state.temporaryPanState !== 'inactive') return
      if (event.target.closest('input,textarea,button,a,[contenteditable="true"],.react-flow__handle')) return
      const nodeElement = event.target.closest<HTMLElement>('.react-flow__node')
      const id = nodeElement?.dataset.id
      if (!id || isNodeLocked(state, id)) return
      const resize = event.target.closest('.react-flow__resize-control')
      const direction = resize ? ['left', 'right', 'top', 'bottom'].filter(key => resize.classList.contains(key)) : []
      const selected = new Set(state.selectedNodeIds)
      for (const group of state.groups) if (state.selectedGroupIds.includes(group.id)) group.members.nodeIds.forEach(member => selected.add(member))
      const ids = direction.length || !selected.has(id) ? [id] : [...selected]
      const initial: Record<string, CanvasNodeGeometryDraft> = {}
      for (const node of state.nodes) {
        if (!ids.includes(node.id) || isNodeLocked(state, node.id)) continue
        const bounds = element.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`)?.getBoundingClientRect()
        initial[node.id] = { x: node.at.x, y: node.at.y, width: node.at.w ?? (bounds?.width ?? 320) / state.viewport.zoom,
          height: node.at.h ?? (bounds?.height ?? 220) / state.viewport.zoom,
          preserveAutoHeight: node.at.h === undefined && !direction.includes('top') && !direction.includes('bottom') }
      }
      gesture = { pointer: event.pointerId, x: event.clientX, y: event.clientY, latestX: event.clientX, latestY: event.clientY, zoom: state.viewport.zoom, requested: false, ready: false, phase: 'dragging', approval: null, direction, initial, draft: initial }
      if (resize) { event.preventDefault(); event.stopPropagation() }
    }
    const updatePreview = (current: Gesture) => {
      if (current.ready && !authority.isHeld(Object.keys(current.initial))) { void finish(false); return }
      const dx = (current.latestX - current.x) / current.zoom, dy = (current.latestY - current.y) / current.zoom
      const drafts: Record<string, CanvasNodeGeometryDraft> = {}
      for (const [id, initial] of Object.entries(current.initial)) {
        if (!current.direction.length) drafts[id] = { ...initial, x: Math.round(initial.x + dx), y: Math.round(initial.y + dy) }
        else {
          let width = Math.max(120, initial.width + (current.direction.includes('left') ? -dx : current.direction.includes('right') ? dx : 0))
          let height = Math.max(120, initial.height + (current.direction.includes('top') ? -dy : current.direction.includes('bottom') ? dy : 0))
          const node = store.getState().nodes.find(node => node.id === id)
          if (node?.component === 'image' && node.lockAspectRatio) {
            if (current.direction.includes('left') || current.direction.includes('right')) height = width * initial.height / initial.width
            else width = height * initial.width / initial.height
          }
          drafts[id] = { ...initial, width: Math.round(width), height: Math.round(height),
            x: Math.round(initial.x + (current.direction.includes('left') ? initial.width - width : 0)),
            y: Math.round(initial.y + (current.direction.includes('top') ? initial.height - height : 0)) }
        }
      }
      current.draft = drafts
      previewRef.current(drafts)
    }
    const move = (event: PointerEvent) => {
      const current = gesture
      if (!current || current.phase !== 'dragging' || event.pointerId !== current.pointer) return
      current.latestX = event.clientX; current.latestY = event.clientY
      if (!current.requested && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4) return
      event.preventDefault(); event.stopPropagation()
      if (!current.requested) {
        current.requested = true
        suppressClick = true
        store.getState().setPointerInteractionState({ status: 'node-drag' })
        current.approval = authority.begin(Object.keys(current.initial)).then(allowed => {
          if (gesture !== current) return false
          current.ready = allowed
          if (!allowed && current.phase === 'dragging') void clear(current)
          return allowed
        })
      }
      updatePreview(current)
    }
    const up = (event: PointerEvent) => { if (gesture?.pointer === event.pointerId) void finish(true) }
    const cancel = () => { void finish(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const click = (event: MouseEvent) => { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false } }
    element.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, { capture: true, passive: false })
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('keydown', key, true)
    element.addEventListener('click', click, true)
    return () => {
      cancel()
      element.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('keydown', key, true)
      element.removeEventListener('click', click, true)
    }
  }, [root, store, authority])
}
