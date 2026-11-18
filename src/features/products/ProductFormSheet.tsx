import { useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
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

  const slotsRef = useRef(slots)
  slotsRef.current = slots

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

  function moveSlot(index: number, direction: -1 | 1) {
    setSlots((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const a = next[index]!
      const b = next[target]!
      next[index] = b
      next[target] = a
      return next
    })
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
  const canAddMore = slots.length < MAX_PRODUCT_IMAGES

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
                  La primera es la portada del listado. Podés reordenarlas.
                </p>
                <ul className="image-gallery">
                  {slots.map((slot, index) => {
                    const url =
                      slot.kind === 'pending' ? slot.preview : slot.url
                    const isCover = index === 0
                    return (
                      <li
                        key={slot.kind === 'existing' ? slot.id : url}
                        className="image-gallery-item"
                      >
                        <div
                          className={`image-gallery-card${isCover ? ' is-cover' : ''}`}
                        >
                          {isCover && (
                            <span className="image-gallery-badge">Portada</span>
                          )}
                          <button
                            type="button"
                            className="image-gallery-preview"
                            aria-label={`Ver foto ${index + 1} más grande`}
                            onClick={() => setLightboxUrl(url)}
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
                          <div className="image-gallery-toolbar">
                            <button
                              type="button"
                              className="image-gallery-tool"
                              disabled={busy !== undefined || index === 0}
                              aria-label={`Mover foto ${index + 1} a la izquierda`}
                              onClick={() => moveSlot(index, -1)}
                            >
                              ←
                            </button>
                            <button
                              type="button"
                              className="image-gallery-tool"
                              disabled={
                                busy !== undefined || index === slots.length - 1
                              }
                              aria-label={`Mover foto ${index + 1} a la derecha`}
                              onClick={() => moveSlot(index, 1)}
                            >
                              →
                            </button>
                            <button
                              type="button"
                              className="image-gallery-tool"
                              disabled={busy !== undefined}
                              aria-label={`Cambiar foto ${index + 1}`}
                              onClick={() => openFilePicker(index)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="image-gallery-tool"
                              disabled={busy !== undefined}
                              aria-label={`Quitar foto ${index + 1}`}
                              onClick={() => removeSlot(index)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                  {Array.from(
                    { length: MAX_PRODUCT_IMAGES - slots.length },
                    (_, emptyIndex) => (
                      <li
                        key={`empty-${emptyIndex}`}
                        className="image-gallery-item"
                      >
                        <button
                          type="button"
                          className="image-gallery-add"
                          disabled={busy !== undefined || !canAddMore}
                          onClick={() => openFilePicker(null)}
                        >
                          <span aria-hidden="true">+</span>
                          <span>
                            {slots.length === 0 && emptyIndex === 0
                              ? 'Agregar'
                              : 'Foto'}
                          </span>
                        </button>
                      </li>
                    ),
                  )}
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
