import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

export interface ConfirmDialogProps {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Visual style of the confirm action. Defaults to `primary`. */
  confirmVariant?: 'primary' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function requestClose() {
    if (!busy) onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose()
      }}
    >
      <div className="confirm-dialog-content">
        <h2 id={titleId}>{title}</h2>
        {description != null && description !== '' && (
          <p id={descriptionId} className="confirm-dialog-description">
            {description}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={requestClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              confirmVariant === 'danger' ? 'danger-button' : 'primary-button'
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
