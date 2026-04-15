import { useEffect } from 'react'
import { Button } from '@canvas-app/components/primitives/button'
import type { CanvasExportFormat, CanvasExportScope } from '@canvas-app/components/scene/canvas-scene-export'

type CanvasExportDialogProps = {
  canExportSelection: boolean
  errorMessage: string | null
  format: CanvasExportFormat
  isOpen: boolean
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
  onFormatChange: (format: CanvasExportFormat) => void
  onScopeChange: (scope: CanvasExportScope) => void
  scope: CanvasExportScope
}

export function CanvasExportDialog({
  canExportSelection,
  errorMessage,
  format,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
  onFormatChange,
  onScopeChange,
  scope
}: CanvasExportDialogProps) {
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onCancel])

  if (!isOpen) {
    return null
  }

  return (
    <div
      aria-hidden={false}
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[color:color-mix(in_oklab,var(--color-on-surface)_18%,transparent)] px-6"
      data-boardmark-export-ignore="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onCancel()
        }
      }}
    >
      <div
        aria-labelledby="canvas-export-title"
        aria-modal="true"
        className={[
          'pointer-events-auto w-full max-w-lg rounded-[1.6rem] bg-[color:color-mix(in_oklab,var(--color-surface-lowest)_96%,white)] p-6',
          'shadow-[0_28px_60px_rgba(43,52,55,0.14)] outline outline-1 outline-[var(--color-outline-ghost)] backdrop-blur-xl'
        ].join(' ')}
        data-boardmark-export-ignore="true"
        role="dialog"
      >
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]"
          id="canvas-export-title"
        >
          Export Canvas
        </p>
        <p className="mt-3 text-base font-semibold text-[var(--color-on-surface)]">
          Choose the file type and range for this export.
        </p>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">
            File type
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ExportChoice
              checked={format === 'png'}
              description="Lossless export with the original board colors."
              disabled={isSubmitting}
              name="canvas-export-format"
              onChange={() => onFormatChange('png')}
              title="PNG"
            />
            <ExportChoice
              checked={format === 'jpeg'}
              description="Smaller file size with a white background fill."
              disabled={isSubmitting}
              name="canvas-export-format"
              onChange={() => onFormatChange('jpeg')}
              title="JPG"
            />
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-on-surface-variant)]">
            Range
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <ExportChoice
              checked={scope === 'document'}
              description="Export every rendered object on the board."
              disabled={isSubmitting}
              name="canvas-export-scope"
              onChange={() => onScopeChange('document')}
              title="Whole board"
            />
            <ExportChoice
              checked={scope === 'selection'}
              description="Export only the current selection and connected edges."
              disabled={isSubmitting || !canExportSelection}
              name="canvas-export-scope"
              onChange={() => onScopeChange('selection')}
              title="Selection only"
            />
          </div>
        </fieldset>

        {errorMessage ? (
          <p className="mt-4 rounded-[1rem] bg-[color:color-mix(in_oklab,var(--color-primary)_8%,white)] px-4 py-3 text-sm text-[var(--color-on-surface)]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            disabled={isSubmitting}
            emphasis="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            disabled={isSubmitting}
            emphasis="primary"
            onClick={onConfirm}
          >
            {isSubmitting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ExportChoice({
  checked,
  description,
  disabled,
  name,
  onChange,
  title
}: {
  checked: boolean
  description: string
  disabled: boolean
  name: string
  onChange: () => void
  title: string
}) {
  return (
    <label
      className={[
        'flex cursor-pointer flex-col gap-1 rounded-[1.1rem] px-4 py-3 transition-[transform,background-color,box-shadow,color] duration-150',
        checked
          ? 'bg-[color:color-mix(in_oklab,var(--color-primary)_12%,white)] text-[var(--color-on-surface)] shadow-[0_10px_22px_rgba(43,52,55,0.08)]'
          : 'bg-[color:color-mix(in_oklab,var(--color-surface-container-low)_72%,white)] text-[var(--color-on-surface)]',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:-translate-y-[1px] hover:bg-[color:color-mix(in_oklab,var(--color-primary)_10%,white)]'
      ].join(' ')}
    >
      <input
        checked={checked}
        className="sr-only"
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="radio"
      />
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-sm leading-6 text-[var(--color-on-surface-variant)]">{description}</span>
    </label>
  )
}
