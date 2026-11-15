import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { HttpError, UnauthorizedError } from '../../api.ts'
import type { Category, Product, ProductInput } from '../../api.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx'
import { ImageLightbox } from '../../components/ImageLightbox.tsx'
import { toast } from 'sonner'
import { ProductThumb } from './ProductThumb.tsx'
import { prepareImage } from './prepareImage.ts'

export interface ProductSavePayload {
  input: ProductInput
  /** New photo to upload with the product. Omitted when the photo did not change. */
  image?: Blob
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
    return 'La foto pesa demasiado. Probá con una más liviana.'
  }
  if (error instanceof HttpError && error.status === 415) {
    return 'Ese archivo no es una foto válida. Usá JPG, PNG o WebP.'
  }
  return 'No pudimos guardar el producto. Revisá los datos y probá de nuevo.'
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
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? defaultCategoryId ?? '',
  )
  const [description, setDescription] = useState(product?.description ?? '')
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '')
  const [pendingImage, setPendingImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<'saving' | 'deleting'>()
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  function close() {
    if (!busy && !confirmDeleteOpen && !lightboxOpen) onClose()
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    let image: Blob
    try {
      image = await prepareImage(file)
    } catch (caught) {
      console.error(caught)
      toast.error('No pudimos leer esa foto. Probá con otra en JPG, PNG o WebP.')
      return
    }

    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(image))
    setPendingImage(image)
  }

  function clearImage() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setPendingImage(null)
    setImageUrl('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('saving')
    try {
      await onSave({
        input: {
          name: name.trim(),
          price: Number(price),
          categoryId,
          description: description.trim() || null,
          imageUrl: pendingImage ? null : imageUrl || null,
        },
        image: pendingImage ?? undefined,
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

  const displayUrl = preview ?? (imageUrl || null)
  const hasImage = Boolean(displayUrl)
  const thumbProduct = {
    id: product?.id,
    imageUrl: displayUrl,
    categoryKey:
      categories.find((category) => category.id === categoryId)?.key ?? '',
  }

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

            <div className="image-field">
              {hasImage ? (
                <button
                  type="button"
                  className="thumb-zoom-button"
                  aria-label="Ver foto más grande"
                  onClick={() => setLightboxOpen(true)}
                >
                  <ProductThumb product={thumbProduct} size="large" />
                </button>
              ) : (
                <ProductThumb product={thumbProduct} size="large" />
              )}
              <div className="field">
                <span>
                  Foto <small>(opcional)</small>
                </span>
                <div className="image-field-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy !== undefined}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {hasImage ? 'Cambiar foto' : 'Elegir foto'}
                  </button>
                  {hasImage && (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy !== undefined}
                      onClick={clearImage}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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

      {lightboxOpen && displayUrl && (
        <ImageLightbox
          src={displayUrl}
          alt={name.trim() || 'Foto del producto'}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  )
}
