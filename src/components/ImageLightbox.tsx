import { useEffect, useRef } from 'react'

export interface ImageLightboxProps {
  src: string
  alt?: string
  onClose: () => void
}

export function ImageLightbox({
  src,
  alt = '',
  onClose,
}: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className="image-lightbox"
      aria-label="Foto ampliada"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <button
        type="button"
        className="icon-button image-lightbox-close"
        aria-label="Cerrar"
        onClick={onClose}
      >
        ✕
      </button>
      <img src={src} alt={alt} />
    </dialog>
  )
}
