import { useEffect, useMemo, useState } from 'react'

export type CanvasObjectContextMenuState = {
  kind: 'canvas' | 'selection'
  x: number
  y: number
}

export function useObjectContextMenu() {
  const [objectContextMenu, setObjectContextMenu] = useState<CanvasObjectContextMenuState | null>(null)

  useEffect(() => {
    if (!objectContextMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (target instanceof HTMLElement && target.closest('[role="menu"]')) {
        return
      }

      setObjectContextMenu(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [objectContextMenu])

  const alignedObjectContextMenu = useMemo(() => {
    if (!objectContextMenu) {
      return null
    }

    return {
      ...objectContextMenu,
      x: Math.min(objectContextMenu.x, window.innerWidth - 248),
      y: Math.min(objectContextMenu.y, window.innerHeight - 320)
    }
  }, [objectContextMenu])

  return {
    alignedObjectContextMenu,
    closeObjectContextMenu() {
      setObjectContextMenu(null)
    },
    objectContextMenu,
    setObjectContextMenu
  }
}
