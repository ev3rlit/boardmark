import { useEffect, useMemo, useRef, useState } from 'react'
import { NodeToolbar, Position, useInternalNode } from '@xyflow/react'
import { Ban, Circle, Maximize2, PaintBucket } from 'lucide-react'
import {
  ColorArea,
  ColorPicker,
  ColorSlider,
  ColorThumb,
  SliderTrack,
  parseColor,
  type Color
} from 'react-aria-components'
import {
  CANVAS_NO_FILL_COLOR,
  isCanvasNodeColorableComponent,
  resolveCanvasObjectBackgroundColor,
  resolveCanvasObjectStrokeColor
} from '@boardmark/canvas-domain'
import { useStore } from 'zustand'
import type { CanvasStore } from '@canvas-app/store/canvas-store'
import type { CanvasStoreState } from '@canvas-app/store/canvas-store-types'

type SelectionToolbarProps = {
  nodeId: string
  selected: boolean
  isEditing: boolean
  locked: boolean
  autoHeight: boolean
  store: CanvasStore
}

const BACKGROUND_COLOR_SWATCHES = [
  '#FFF5BF',
  '#FFFFFF',
  '#D7E8FF',
  '#DDF3E4',
  '#FFE6D9',
  '#F2E5FF',
  '#F8DDE8'
] as const

const OUTLINE_COLOR_SWATCHES = [
  '#6042D6',
  '#2B3437',
  '#2563EB',
  '#0F766E',
  '#C2410C',
  '#BE185D',
  '#7C3AED'
] as const

type ColorSwatchItem =
  | { kind: 'color'; value: string }
  | { kind: 'custom' }
  | { kind: 'no-fill' }

export function SelectionToolbar({
  nodeId,
  selected,
  isEditing,
  locked,
  autoHeight,
  store
}: SelectionToolbarProps) {
  const resetNodeHeight = useStore(store, (state) => state.resetNodeHeight)
  const commitNodeResize = useStore(store, (state) => state.commitNodeResize)
  const setSelectedObjectColor = useStore(store, (state) => state.setSelectedObjectColor)
  const selectionToolbarState = useStore(store, (state) => state.selectionToolbarState)
  const setSelectionToolbarState = useStore(store, (state) => state.setSelectionToolbarState)
  const colorEnabled = useStore(store, (state) => readSelectionToolbarColorState(state, nodeId).enabled)
  const backgroundMixed = useStore(store, (state) => readSelectionToolbarColorState(state, nodeId).background.mixed)
  const backgroundValue = useStore(store, (state) => readSelectionToolbarColorState(state, nodeId).background.value)
  const outlineMixed = useStore(store, (state) => readSelectionToolbarColorState(state, nodeId).outline.mixed)
  const outlineValue = useStore(store, (state) => readSelectionToolbarColorState(state, nodeId).outline.value)
  const internalNode = useInternalNode(nodeId)
  const [customPickerColor, setCustomPickerColor] = useState<Color>(parseColor('#FFF5BF'))
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const openTarget = selectionToolbarState.nodeId === nodeId ? selectionToolbarState.target : null
  const customPickerOpen =
    selectionToolbarState.nodeId === nodeId && selectionToolbarState.customPickerOpen
  const colorState = useMemo(() => ({
    enabled: colorEnabled,
    background: {
      mixed: backgroundMixed,
      value: backgroundValue
    },
    outline: {
      mixed: outlineMixed,
      value: outlineValue
    }
  }), [backgroundMixed, backgroundValue, colorEnabled, outlineMixed, outlineValue])

  useEffect(() => {
    if (!openTarget) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Node) || popoverRef.current?.contains(target)) {
        return
      }

      setSelectionToolbarState({
        nodeId: null,
        target: null,
        customPickerOpen: false
      })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectionToolbarState({
          nodeId: null,
          target: null,
          customPickerOpen: false
        })
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openTarget, setSelectionToolbarState])

  useEffect(() => {
    if (selectionToolbarState.nodeId !== nodeId) {
      return
    }

    if (selected && !isEditing && !locked) {
      return
    }

    setSelectionToolbarState({
      nodeId: null,
      target: null,
      customPickerOpen: false
    })
  }, [isEditing, locked, nodeId, selected, selectionToolbarState.nodeId, setSelectionToolbarState])

  useEffect(() => {
    if (!openTarget) {
      return
    }

    const activeValue = openTarget === 'bg' ? colorState.background.value : colorState.outline.value
    const fallbackValue = openTarget === 'bg' ? '#FFF5BF' : '#6042D6'
    setCustomPickerColor(parseColor(
      activeValue && activeValue !== CANVAS_NO_FILL_COLOR ? activeValue : fallbackValue
    ))
  }, [colorState.background.value, colorState.outline.value, openTarget])

  const handleToggle = () => {
    if (autoHeight) {
      // auto → fixed: freeze at current measured height
      if (!internalNode) return
      const height = internalNode.measured?.height ?? internalNode.height
      if (height === undefined) return
      void commitNodeResize(nodeId, {
        x: internalNode.position.x,
        y: internalNode.position.y,
        width: internalNode.measured?.width ?? internalNode.width ?? 200,
        height
      })
    } else {
      // fixed → auto: remove explicit h
      void resetNodeHeight(nodeId)
    }
  }

  const backgroundSwatches = useMemo(() => {
    return buildColorSwatches(BACKGROUND_COLOR_SWATCHES)
  }, [])
  const outlineSwatches = useMemo(() => {
    return buildColorSwatches(OUTLINE_COLOR_SWATCHES)
  }, [])

  const applyColor = async (target: 'bg' | 'stroke', value: string) => {
    await setSelectedObjectColor(target, value)
  }

  return (
    <NodeToolbar
      isVisible={selected && !isEditing && !locked}
      position={Position.Top}
      offset={8}
    >
      <div
        className="relative nodrag nopan"
        data-boardmark-export-ignore="true"
        ref={popoverRef}
      >
        <div
          aria-label="Object actions"
          className="viewer-control-group"
          role="toolbar"
        >
          <button
            aria-label="Auto height"
            aria-pressed={autoHeight}
            className={[
              'viewer-control-button',
              autoHeight ? 'viewer-control-button--active' : ''
            ].join(' ').trim()}
            onClick={handleToggle}
            type="button"
          >
            <Maximize2
              aria-hidden="true"
              className="viewer-control-icon"
            />
          </button>
          <button
            aria-expanded={openTarget === 'bg'}
            aria-haspopup="dialog"
            aria-label="Background color"
            className={[
              'viewer-control-button',
              openTarget === 'bg' ? 'viewer-control-button--active' : ''
            ].join(' ').trim()}
            disabled={!colorState.enabled}
            onClick={() => {
              if (!colorState.enabled) {
                return
              }

              setSelectionToolbarState({
                nodeId,
                target: openTarget === 'bg' ? null : 'bg',
                customPickerOpen: false
              })
            }}
            type="button"
          >
            <PaintBucket
              aria-hidden="true"
              className="viewer-control-icon"
            />
          </button>
          <button
            aria-expanded={openTarget === 'stroke'}
            aria-haspopup="dialog"
            aria-label="Outline color"
            className={[
              'viewer-control-button',
              openTarget === 'stroke' ? 'viewer-control-button--active' : ''
            ].join(' ').trim()}
            disabled={!colorState.enabled}
            onClick={() => {
              if (!colorState.enabled) {
                return
              }

              setSelectionToolbarState({
                nodeId,
                target: openTarget === 'stroke' ? null : 'stroke',
                customPickerOpen: false
              })
            }}
            type="button"
          >
            <Circle
              aria-hidden="true"
              className="viewer-control-icon"
            />
          </button>
        </div>
        {openTarget ? (
          <div
            aria-label={openTarget === 'bg' ? 'Background colors' : 'Outline colors'}
            className="viewer-context-menu selection-color-popover top-[calc(100%+0.75rem)] left-0"
            role="dialog"
          >
            <ColorSection
              activeValue={openTarget === 'bg' ? colorState.background.value : colorState.outline.value}
              customPickerColor={customPickerColor}
              customPickerOpen={customPickerOpen}
              label={openTarget === 'bg' ? 'Background' : 'Outline'}
              mixed={openTarget === 'bg' ? colorState.background.mixed : colorState.outline.mixed}
              onColorInputChange={(value) => {
                if (value === '__custom__') {
                  setSelectionToolbarState({
                    nodeId,
                    target: openTarget,
                    customPickerOpen: !customPickerOpen
                  })
                  return
                }

                void applyColor(openTarget, value)
              }}
              onCustomColorChange={setCustomPickerColor}
              onCustomColorCommit={(value) => {
                void applyColor(openTarget, value.toString('hexa').toUpperCase())
              }}
              onNoFill={() => {
                void applyColor(openTarget, CANVAS_NO_FILL_COLOR)
              }}
              swatches={openTarget === 'bg' ? backgroundSwatches : outlineSwatches}
            />
          </div>
        ) : null}
      </div>
    </NodeToolbar>
  )
}

type ColorSectionProps = {
  activeValue: string | undefined
  customPickerColor: Color
  customPickerOpen: boolean
  label: string
  mixed: boolean
  onColorInputChange: (value: string) => void
  onCustomColorChange: (value: Color) => void
  onCustomColorCommit: (value: Color) => void
  onNoFill: () => void
  swatches: readonly ColorSwatchItem[]
}

function ColorSection({
  activeValue,
  customPickerColor,
  customPickerOpen,
  label,
  mixed,
  onColorInputChange,
  onCustomColorChange,
  onCustomColorCommit,
  onNoFill,
  swatches
}: ColorSectionProps) {
  const customSwatchValue = readCustomSwatchValue(activeValue, swatches)

  return (
    <div className="selection-color-section">
      <div className="selection-color-swatch-grid">
        {swatches.map((swatch) => {
          if (swatch.kind === 'no-fill') {
            const isActive = !mixed && activeValue === CANVAS_NO_FILL_COLOR

            return (
              <button
                key={`${label}-no-fill`}
                aria-label={`${label} no fill`}
                aria-pressed={isActive}
                className={[
                  'selection-color-swatch',
                  isActive ? 'selection-color-swatch--active' : ''
                ].join(' ').trim()}
                onClick={onNoFill}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="selection-color-swatch__chip selection-color-swatch__chip--transparent"
                >
                  <Ban className="selection-color-swatch__icon" />
                </span>
              </button>
            )
          }

          if (swatch.kind === 'custom') {
            const isActive = !mixed && customSwatchValue !== null

            return (
              <button
                key={`${label}-custom`}
                aria-label={`${label} custom color`}
                aria-pressed={isActive}
                className={[
                  'selection-color-swatch',
                  isActive ? 'selection-color-swatch--active' : ''
                ].join(' ').trim()}
                onClick={() => onColorInputChange('__custom__')}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={[
                    'selection-color-swatch__chip',
                    customSwatchValue === null ? 'selection-color-swatch__chip--rainbow' : ''
                  ].join(' ').trim()}
                  style={customSwatchValue
                    ? {
                        background: customSwatchValue
                      }
                    : undefined}
                />
              </button>
            )
          }

          const isActive = !mixed && activeValue === swatch.value

          return (
            <button
              key={swatch.value}
              aria-label={`${label} ${swatch.value}`}
              aria-pressed={isActive}
              className={[
                'selection-color-swatch',
                isActive ? 'selection-color-swatch--active' : ''
              ].join(' ').trim()}
              onClick={() => {
                onColorInputChange(swatch.value)
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="selection-color-swatch__chip"
                style={{
                  background: swatch.value
                }}
              />
            </button>
          )
        })}
      </div>
      {customPickerOpen ? (
        <div className="selection-color-custom-picker">
          <ColorPicker
            aria-label={`${label} custom picker`}
            value={customPickerColor}
            onChange={onCustomColorChange}
          >
            <ColorArea
              aria-label={`${label} color area`}
              className="selection-color-custom-picker__area"
              colorSpace="hsb"
              onChangeEnd={onCustomColorCommit}
              xChannel="saturation"
              yChannel="brightness"
            >
              <ColorThumb className="selection-color-custom-picker__thumb" />
            </ColorArea>
            <ColorSlider
              aria-label={`${label} hue`}
              channel="hue"
              className="selection-color-custom-picker__slider"
              colorSpace="hsb"
              onChangeEnd={onCustomColorCommit}
            >
              <SliderTrack className="selection-color-custom-picker__track">
                <ColorThumb className="selection-color-custom-picker__thumb selection-color-custom-picker__thumb--slider" />
              </SliderTrack>
            </ColorSlider>
            <ColorSlider
              aria-label={`${label} alpha`}
              channel="alpha"
              className="selection-color-custom-picker__slider"
              onChangeEnd={onCustomColorCommit}
            >
              <SliderTrack className="selection-color-custom-picker__track">
                <ColorThumb className="selection-color-custom-picker__thumb selection-color-custom-picker__thumb--slider" />
              </SliderTrack>
            </ColorSlider>
          </ColorPicker>
        </div>
      ) : null}
    </div>
  )
}

type ToolbarColorState = {
  enabled: boolean
  background: {
    mixed: boolean
    value: string | undefined
  }
  outline: {
    mixed: boolean
    value: string | undefined
  }
}

function readSelectionToolbarColorState(
  state: CanvasStoreState,
  nodeId: string
): ToolbarColorState {
  const selectedNodeIds =
    state.selectedNodeIds.length > 0 && state.selectedNodeIds.includes(nodeId)
      ? state.selectedNodeIds
      : [nodeId]
  const selectedNodes = selectedNodeIds
    .map((selectedId) => state.nodes.find((node) => node.id === selectedId))
    .filter((node): node is CanvasStoreState['nodes'][number] => node !== undefined)
    .filter((node) => isCanvasNodeColorableComponent(node.component))

  return {
    enabled: selectedNodes.length > 0,
    background: readSharedSelectionColor(selectedNodes, 'bg'),
    outline: readSharedSelectionColor(selectedNodes, 'stroke')
  }
}

function readSharedSelectionColor(
  nodes: CanvasStoreState['nodes'],
  target: 'bg' | 'stroke'
) {
  if (nodes.length === 0) {
    return {
      mixed: false,
      value: undefined
    }
  }

  const values = nodes.map((node) => {
    return target === 'bg'
      ? resolveCanvasObjectBackgroundColor(node.component, node.style)
      : resolveCanvasObjectStrokeColor(node.component, node.style)
  })
  const value = values[0]
  const mixed = values.some((entry) => entry !== value)

  return {
    mixed,
    value: mixed ? undefined : value
  }
}

function buildColorSwatches(swatches: readonly string[]): ColorSwatchItem[] {
  return [
    { kind: 'no-fill' },
    ...swatches.map((value) => ({ kind: 'color', value }) satisfies ColorSwatchItem),
    { kind: 'custom' }
  ]
}

function readCustomSwatchValue(
  activeValue: string | undefined,
  swatches: readonly ColorSwatchItem[]
) {
  if (!activeValue || activeValue === CANVAS_NO_FILL_COLOR) {
    return null
  }

  const isPreset = swatches.some((swatch) => swatch.kind === 'color' && swatch.value === activeValue)

  return isPreset ? null : activeValue
}
