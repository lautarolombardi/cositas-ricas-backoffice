import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { HttpError, UnauthorizedError } from '../../api.ts'
import type { Category, Product, ProductInput } from '../../api.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { ImageLightbox } from '../../components/ImageLightbox.tsx'
import { toast } from 'sonner'
import { ProductThumb } from './ProductThumb.tsx'
import { prepareImage } from './prepareImage.ts'

const MAX_PRODUCT_IMAGES = 3

type PendingImageSlot = { kind: 'pending'; blob: Blob; preview: string }

type ImageSlot =
  | { kind: 'existing'; id: string; url: string }
  | PendingImageSlot

export interface ProductSavePayload {
  input: ProductInput
  /** Ordered plan of kept image ids and nulls for new uploads. Omitted when unchanged. */
  imageIds?: (string | null)[]
  /** New photos matching null slots in `imageIds` (create: all new photos). */
  images?: Blob[]
}

interface ProductFormSheetProps {
  product: Product | null
  categories: Category[]
  defaultCategoryId: string | undefined
  onSave: (payload: ProductSavePayload) => Promise<void>
  onDelete: (product: Product) => Promise<void>
  onClose: () => void
}

function saveErrorMessage(error: unknown) {
  if (error instanceof HttpError && error.status === 413) {
    return 'Alguna foto pesa demasiado. Probá con una más liviana.'
  }
  if (error instanceof HttpError && error.status === 415) {
    return 'Ese archivo no es una foto válida. Usá JPG, PNG o WebP.'
  }
  return 'No pudimos guardar el producto. Revisá los datos y probá de nuevo.'
}

function slotsFromProduct(product: Product | null): ImageSlot[] {
  return (product?.images ?? [])
    .toSorted((a, b) => a.position - b.position)
    .map((image) => ({ kind: 'existing' as const, id: image.id, url: image.url }))
}

function sameImagePlan(original: Product | null, slots: ImageSlot[]) {
  const originalIds = (original?.images ?? [])
    .toSorted((a, b) => a.position - b.position)
    .map((image) => image.id)
  if (slots.some((slot) => slot.kind === 'pending')) return false
  if (slots.length !== originalIds.length) return false
  return slots.every(
    (slot, index) => slot.kind === 'existing' && slot.id === originalIds[index],
  )
}

export function ProductFormSheet({
  product,
  categories,
  defaultCategoryId,
  onSave,
  onDelete,
  onClose,
}: ProductFormSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceIndexRef = useRef<number | null>(null)
  const imagesLabelId = useId()
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? defaultCategoryId ?? '',
  )
  const [description, setDescription] = useState(product?.description ?? '')
  const [slots, setSlots] = useState<ImageSlot[]>(() => slotsFromProduct(product))
  const [busy, setBusy] = useState<'saving' | 'deleting'>()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const dragFromRef = useRef<number | null>(null)
  const dragOverRef = useRef<number | null>(null)
  const suppressPreviewClickRef = useRef(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) {
        if (slot.kind === 'pending') URL.revokeObjectURL(slot.preview)
      }
    }
  }, [])

  function close() {
    if (!busy && !confirmDeleteOpen && !lightboxUrl) onClose()
  }

  function openFilePicker(replaceIndex: number | null = null) {
    replaceIndexRef.current = replaceIndex
    fileInputRef.current?.click()
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (files.length === 0) return

    const replaceIndex = replaceIndexRef.current
    replaceIndexRef.current = null

    const prepared: PendingImageSlot[] = []
    for (const file of files) {
      try {
        const blob = await prepareImage(file)
        prepared.push({
          kind: 'pending',
          blob,
          preview: URL.createObjectURL(blob),
        })
      } catch (caught) {
        console.error(caught)
        toast.error(
          'No pudimos leer esa foto. Probá con otra en JPG, PNG o WebP.',
        )
      }
    }
    if (prepared.length === 0) return

    setSlots((current) => {
      if (replaceIndex !== null) {
        const previous = current[replaceIndex]
        if (previous?.kind === 'pending') URL.revokeObjectURL(previous.preview)
        const next = [...current]
        next[replaceIndex] = prepared[0]!
        for (const extra of prepared.slice(1)) {
          URL.revokeObjectURL(extra.preview)
        }
        return next
      }

      const room = MAX_PRODUCT_IMAGES - current.length
      const accepted = prepared.slice(0, room)
      for (const extra of prepared.slice(room)) {
        URL.revokeObjectURL(extra.preview)
      }
      if (accepted.length < prepared.length) {
        toast.message(`Podés cargar hasta ${MAX_PRODUCT_IMAGES} fotos.`)
      }
      return [...current, ...accepted]
    })
  }

  function removeSlot(index: number) {
    setSlots((current) => {
      const target = current[index]
      if (target?.kind === 'pending') URL.revokeObjectURL(target.preview)
      return current.filter((_, i) => i !== index)
    })
  }

  function reorderSlot(from: number, to: number) {
    setSlots((current) => {
      if (from === to || from < 0 || to < 0 || to >= current.length) {
        return current
      }
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      return next
    })
  }

  function handleImagePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (busy || event.button !== 0) return

    const preview = event.currentTarget
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const canDrag = slotsRef.current.length >= 2
    let active = false

    const stop = () => {
      if (preview.hasPointerCapture(pointerId)) {
        preview.releasePointerCapture(pointerId)
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragFromRef.current = null
      dragOverRef.current = null
      setDragFrom(null)
      setDragOver(null)
    }

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || !canDrag) return
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY)
      if (!active && distance < 8) return
      if (!active) {
        active = true
        suppressPreviewClickRef.current = true
        dragFromRef.current = index
        dragOverRef.current = index
        setDragFrom(index)
        setDragOver(index)
        preview.setPointerCapture(pointerId)
        ev.preventDefault()
      }

      const under = document.elementFromPoint(ev.clientX, ev.clientY)
      const item = under?.closest<HTMLElement>('[data-slot-index]')
      if (!item) return
      const over = Number(item.dataset.slotIndex)
      if (
        Number.isNaN(over) ||
        over < 0 ||
        over >= slotsRef.current.length ||
        dragOverRef.current === over
      ) {
        return
      }
      dragOverRef.current = over
      setDragOver(over)
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const from = dragFromRef.current
      const to = dragOverRef.current
      const didDrag = active
      stop()
      if (didDrag && from != null && to != null) reorderSlot(from, to)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('saving')
    try {
      const input: ProductInput = {
        name: name.trim(),
        price: Number(price),
        categoryId,
        description: description.trim() || null,
      }
      const imagesChanged = !sameImagePlan(product, slots)
      const images = slots
        .filter((slot) => slot.kind === 'pending')
        .map((slot) => slot.blob)
      const imageIds = imagesChanged
        ? slots.map((slot) => (slot.kind === 'existing' ? slot.id : null))
        : undefined

      await onSave({
        input,
        imageIds,
        images: images.length > 0 ? images : undefined,
      })
    } catch (caught) {
      if (caught instanceof UnauthorizedError) return
      console.error(caught)
      toast.error(saveErrorMessage(caught))
      setBusy(undefined)
    }
  }

  async function handleDelete() {
    if (!product) return
    setBusy('deleting')
    try {
      await onDelete(product)
    } catch (caught) {
      if (caught instanceof UnauthorizedError) return
      console.error(caught)
      toast.error(`No pudimos eliminar “${product.name}”. Probá de nuevo.`)
      setBusy(undefined)
      setConfirmDeleteOpen(false)
    }
  }

  const categoryKey =
    categories.find((category) => category.id === categoryId)?.key ?? ''

  return (
    <>
      <dialog
        ref={dialogRef}
        className="sheet"
        aria-labelledby="product-form-title"
        onCancel={(event) => {
          event.preventDefault()
          close()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close()
        }}
      >
        <form className="sheet-content" onSubmit={handleSubmit}>
          <header className="sheet-header">
            <h2 id="product-form-title">
              {product ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Cerrar"
              onClick={close}
            >
              ✕
            </button>
          </header>

          <div className="form-fields">
            <label className="field">
              <span>Nombre</span>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Precio</span>
                <input
                  type="number"
                  inputMode="decimal"
                  required
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Categoría</span>
                <select
                  required
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="" disabled>
                    Elegí una
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span>
                Descripción <small>(opcional)</small>
              </span>
              <textarea
                rows={3}
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="image-field" aria-labelledby={imagesLabelId}>
              <div className="field">
                <span id={imagesLabelId}>
                  Fotos <small>(hasta {MAX_PRODUCT_IMAGES})</small>
                </span>
                <p className="image-field-hint">
                  Arrastrá las fotos para reordenar. La primera es la portada.
                </p>
                <ul className="image-gallery">
                  {Array.from({ length: MAX_PRODUCT_IMAGES }, (_, index) => {
                    const slot = slots[index]
                    if (!slot) {
                      const isNext = index === slots.length
                      return (
                        <li key={`empty-${index}`} className="image-gallery-item">
                          <div className="image-gallery-card">
                            <button
                              type="button"
                              className={`image-gallery-frame image-gallery-add${isNext ? '' : ' is-placeholder'}`}
                              disabled={busy !== undefined || !isNext}
                              aria-label={
                                isNext
                                  ? `Agregar foto ${index + 1}`
                                  : `Espacio para foto ${index + 1}`
                              }
                              onClick={() => {
                                if (isNext) openFilePicker(null)
                              }}
                            >
                              {isNext ? (
                                <>
                                  <span
                                    className="image-gallery-add-icon"
                                    aria-hidden="true"
                                  >
                                    +
                                  </span>
                                  <span className="image-gallery-add-label">
                                    Agregar
                                  </span>
                                </>
                              ) : null}
                            </button>
                            <div
                              className="image-gallery-toolbar"
                              aria-hidden="true"
                            />
                          </div>
                        </li>
                      )
                    }

                    const url =
                      slot.kind === 'pending' ? slot.preview : slot.url
                    const isCover = index === 0
                    const isDragging = dragFrom === index
                    const isDropTarget =
                      dragFrom != null &&
                      dragOver === index &&
                      dragFrom !== index
                    return (
                      <li
                        key={slot.kind === 'existing' ? slot.id : url}
                        className={`image-gallery-item${isDragging ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
                        data-slot-index={index}
                      >
                        <div
                          className={`image-gallery-card${isCover ? ' is-cover' : ''}`}
                        >
                          <div className="image-gallery-frame">
                            {isCover && (
                              <span className="image-gallery-badge">Portada</span>
                            )}
                            <button
                              type="button"
                              className={`image-gallery-preview${slots.length > 1 ? ' is-draggable' : ''}`}
                              aria-label={
                                slots.length > 1
                                  ? `Foto ${index + 1}: arrastrar para reordenar o tocar para ampliar`
                                  : `Ver foto ${index + 1} más grande`
                              }
                              onPointerDown={(event) =>
                                handleImagePointerDown(event, index)
                              }
                              onClick={() => {
                                if (suppressPreviewClickRef.current) {
                                  suppressPreviewClickRef.current = false
                                  return
                                }
                                setLightboxUrl(url)
                              }}
                            >
                              <ProductThumb
                                product={{
                                  id: product?.id,
                                  imageUrl: url,
                                  categoryKey,
                                }}
                                size="large"
                              />
                            </button>
                          </div>
                          <div className="image-gallery-toolbar">
                            <button
                              type="button"
                              className="icon-button image-gallery-action"
                              disabled={busy !== undefined}
                              aria-label={`Cambiar foto ${index + 1}`}
                              onClick={() => openFilePicker(index)}
                            >
                              <ReplaceImageIcon />
                            </button>
                            <button
                              type="button"
                              className="icon-button image-gallery-action"
                              disabled={busy !== undefined}
                              aria-label={`Quitar foto ${index + 1}`}
                              onClick={() => removeSlot(index)}
                            >
                              <CloseIcon />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={handleImageChange}
                />
              </div>
            </div>
          </div>

          <footer className="sheet-footer">
            <button
              type="submit"
              className="primary-button"
              disabled={busy !== undefined}
            >
              {busy === 'saving' ? 'Guardando…' : 'Guardar'}
            </button>
            {product && (
              <button
                type="button"
                className="danger-button"
                disabled={busy !== undefined}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                Eliminar producto
              </button>
            )}
          </footer>
        </form>
      </dialog>

      {confirmDeleteOpen && product && (
        <ConfirmDialog
          title="Eliminar producto"
          description={`¿Eliminar “${product.name}” definitivamente? Si solo querés sacarlo de la tienda, ocultalo desde el listado.`}
          confirmLabel={busy === 'deleting' ? 'Eliminando…' : 'Eliminar'}
          confirmVariant="danger"
          busy={busy === 'deleting'}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
        />
      )}

      {lightboxUrl && (
        <ImageLightbox
          src={lightboxUrl}
          alt={name.trim() || 'Foto del producto'}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  )
}

function ReplaceImageIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
