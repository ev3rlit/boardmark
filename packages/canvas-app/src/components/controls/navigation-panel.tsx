import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { useStore } from 'zustand'
import {
  readCanvasNavigationEntries,
  searchCanvasNavigationEntries,
  type CanvasNavigationEntry
} from '@canvas-app/app/canvas-navigation'
import { matchesEscapeKey } from '@canvas-app/keyboard/key-event-matchers'
import type { CanvasStore } from '@canvas-app/store/canvas-store'

type NavigationPanelProps = {
  isOpen: boolean
  onClose: () => void
  onJumpToEntry: (entry: CanvasNavigationEntry) => void
  store: CanvasStore
}

export function NavigationPanel({
  isOpen,
  onClose,
  onJumpToEntry,
  store
}: NavigationPanelProps) {
  const nodes = useStore(store, (state) => state.nodes)
  const edges = useStore(store, (state) => state.edges)
  const selectedNodeIds = useStore(store, (state) => state.selectedNodeIds)
  const selectedEdgeIds = useStore(store, (state) => state.selectedEdgeIds)
  const [query, setQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const entries = useMemo(() => readCanvasNavigationEntries({
    edges,
    nodes
  }), [edges, nodes])
  const searchResults = useMemo(
    () => searchCanvasNavigationEntries(entries, query),
    [entries, query]
  )
  const visibleEntries = useMemo(() => {
    if (query.trim().length === 0) {
      return entries.map((entry) => ({
        entry,
        snippet: entry.summary
      }))
    }

    return searchResults
  }, [entries, query, searchResults])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [isOpen])

  useEffect(() => {
    setHighlightedIndex((current) => {
      if (visibleEntries.length === 0) {
        return 0
      }

      return Math.min(current, visibleEntries.length - 1)
    })
  }, [visibleEntries])

  useEffect(() => {
    if (!isOpen || query.trim().length > 0) {
      return
    }

    const selectedId = selectedNodeIds[0] ?? selectedEdgeIds[0] ?? null

    if (!selectedId) {
      return
    }

    const nextIndex = visibleEntries.findIndex((item) => item.entry.id === selectedId)

    if (nextIndex >= 0) {
      setHighlightedIndex(nextIndex)
    }
  }, [isOpen, query, selectedEdgeIds, selectedNodeIds, visibleEntries])

  if (!isOpen) {
    return null
  }

  const selectedObjectId = selectedNodeIds[0] ?? selectedEdgeIds[0] ?? null
  const hasSearchResults = query.trim().length > 0 && visibleEntries.length > 0

  const jumpToHighlightedEntry = (index: number) => {
    const nextEntry = visibleEntries[index]?.entry

    if (!nextEntry) {
      return
    }

    setHighlightedIndex(index)
    onJumpToEntry(nextEntry)
  }

  const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (matchesEscapeKey(event.nativeEvent)) {
      event.preventDefault()

      if (query.trim().length > 0) {
        setQuery('')
        return
      }

      onClose()
      return
    }

    if (event.key === 'ArrowDown') {
      if (visibleEntries.length === 0) {
        return
      }

      event.preventDefault()
      const nextIndex = Math.min(highlightedIndex + 1, visibleEntries.length - 1)
      setHighlightedIndex(nextIndex)
      return
    }

    if (event.key === 'ArrowUp') {
      if (visibleEntries.length === 0) {
        return
      }

      event.preventDefault()
      const nextIndex = Math.max(highlightedIndex - 1, 0)
      setHighlightedIndex(nextIndex)
      return
    }

    if (event.key === 'Enter') {
      const highlightedEntry = visibleEntries[highlightedIndex]?.entry

      if (!highlightedEntry) {
        return
      }

      event.preventDefault()
      onJumpToEntry(highlightedEntry)
    }
  }

  return (
    <aside
      aria-label="Canvas navigation"
      className="canvas-navigation-panel"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="canvas-navigation-panel__toolbar">
        <label className="canvas-navigation-panel__search">
          <Search
            aria-hidden="true"
            className="canvas-navigation-panel__search-icon"
          />
          <input
            aria-label="Search canvas"
            onChange={(event) => {
              setHighlightedIndex(0)
              setQuery(event.target.value)
            }}
            placeholder="Search canvas"
            ref={searchInputRef}
            type="text"
            value={query}
          />
        </label>
        <button
          aria-label="Close navigation"
          className="viewer-control-button canvas-navigation-panel__close"
          onClick={onClose}
          type="button"
        >
          <X
            aria-hidden="true"
            className="viewer-control-icon"
          />
        </button>
      </div>

      <div className="canvas-navigation-panel__section">
        <div className="canvas-navigation-panel__section-header">
          <p className="canvas-navigation-panel__section-label">
            {query.trim().length === 0 ? 'Outline' : 'Search results'}
          </p>
          <div className="canvas-navigation-panel__section-controls">
            <span>{visibleEntries.length}</span>
            {hasSearchResults ? (
              <div className="canvas-navigation-panel__pager">
                <button
                  aria-label="Previous result"
                  className="viewer-control-button canvas-navigation-panel__pager-button"
                  onClick={() => {
                    if (visibleEntries.length === 0) {
                      return
                    }

                    const nextIndex = highlightedIndex <= 0
                      ? visibleEntries.length - 1
                      : highlightedIndex - 1

                    jumpToHighlightedEntry(nextIndex)
                  }}
                  type="button"
                >
                  <ChevronLeft
                    aria-hidden="true"
                    className="viewer-control-icon"
                  />
                </button>
                <button
                  aria-label="Next result"
                  className="viewer-control-button canvas-navigation-panel__pager-button"
                  onClick={() => {
                    if (visibleEntries.length === 0) {
                      return
                    }

                    const nextIndex = highlightedIndex >= visibleEntries.length - 1
                      ? 0
                      : highlightedIndex + 1

                    jumpToHighlightedEntry(nextIndex)
                  }}
                  type="button"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className="viewer-control-icon"
                  />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="canvas-navigation-panel__empty">
            {query.trim().length === 0
              ? 'There are no objects in the current canvas.'
              : 'No objects match the current query.'}
          </div>
        ) : (
          <div className="canvas-navigation-panel__list">
            {visibleEntries.map((item, index) => {
              const isActive = item.entry.id === selectedObjectId
              const isHighlighted = index === highlightedIndex

              return (
                <button
                  aria-pressed={isActive}
                  className={[
                    'canvas-navigation-panel__item',
                    isActive ? 'canvas-navigation-panel__item--active' : '',
                    isHighlighted ? 'canvas-navigation-panel__item--highlighted' : ''
                  ].join(' ').trim()}
                  key={`${item.entry.kind}-${item.entry.id}`}
                  onClick={() => {
                    setHighlightedIndex(index)
                    onJumpToEntry(item.entry)
                  }}
                  type="button"
                >
                  <div className="canvas-navigation-panel__item-meta">
                    <span>{item.entry.kind === 'node' ? 'Node' : 'Edge'}</span>
                    <span>{item.entry.id}</span>
                  </div>
                  <strong>{item.entry.label}</strong>
                  <p>{item.snippet}</p>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}

type CanvasNavigationToggleButtonProps = {
  isOpen: boolean
  onClick: () => void
}

export function CanvasNavigationToggleButton({
  isOpen,
  onClick
}: CanvasNavigationToggleButtonProps) {
  const label = isOpen ? 'Close navigation' : 'Open navigation'

  return (
    <button
      aria-label={label}
      aria-pressed={isOpen}
      className={[
        'viewer-control-button',
        'canvas-navigation-trigger',
        isOpen ? 'canvas-navigation-trigger--active' : ''
      ].join(' ')}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Search
        aria-hidden="true"
        className="viewer-control-icon"
      />
    </button>
  )
}
