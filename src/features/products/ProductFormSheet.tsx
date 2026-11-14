import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { HttpError, UnauthorizedError } from '../../api.ts'
import type { Category, Product, ProductInput } from '../../api.ts'
import { toast } from 'sonner'
import { ProductThumb } from './ProductThumb.tsx'
import { prepareImage } from './prepareImage.ts'

interface ProductFormSheetProps {
  product: Product | null
  categories: Category[]
  defaultCategoryId: string | undefined
  onSave: (input: ProductInput) => Promise<void>
  onUploadImage: (image: Blob) => Promise<string>
  onDelete: (product: Product) => Promise<void>
  onClose: () => void
}

function uploadErrorMessage(error: unknown) {
  if (error instanceof HttpError && error.status === 413) {
    return 'La foto pesa demasiado. Probá con una más liviana.'
  }
  if (error instanceof HttpError && error.status === 415) {
    return 'Ese archivo no es una foto válida. Usá JPG, PNG o WebP.'
  }
  return 'No pudimos subir la foto. Probá de nuevo.'
}

export function ProductFormSheet({
  product,
  categories,
  defaultCategoryId,
  onSave,
  onUploadImage,
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
  const [active, setActive] = useState(product?.active ?? true)
  const [busy, setBusy] = useState<'saving' | 'deleting'>()
  // Local preview of the photo being uploaded; null when no upload is in progress.
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  function close() {
    if (!busy) onClose()
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

    const previewUrl = URL.createObjectURL(image)
    setPreview(previewUrl)
    try {
      setImageUrl(await onUploadImage(image))
    } catch (caught) {
      if (caught instanceof UnauthorizedError) return
      console.error(caught)
      toast.error(uploadErrorMessage(caught))
    } finally {
      URL.revokeObjectURL(previewUrl)
      setPreview(null)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('saving')
    try {
      await onSave({
        name: name.trim(),
        price: Number(price),
        categoryId,
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        active,
      })
    } catch (caught) {
      if (caught instanceof UnauthorizedError) return
      console.error(caught)
      toast.error('No pudimos guardar el producto. Revisá los datos y probá de nuevo.')
      setBusy(undefined)
    }
  }

  async function handleDelete() {
    if (!product) return
    const confirmed = window.confirm(
      `¿Eliminar “${product.name}” definitivamente? Si solo querés sacarlo de la tienda, desactivalo.`,
    )
    if (!confirmed) return
    setBusy('deleting')
    try {
      await onDelete(product)
    } catch (caught) {
      if (caught instanceof UnauthorizedError) return
      console.error(caught)
      toast.error(`No pudimos eliminar “${product.name}”. Probá de nuevo.`)
      setBusy(undefined)
    }
  }

  return (
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

          <div className="image-field" aria-busy={preview !== null}>
            <ProductThumb
              product={{
                id: product?.id,
                imageUrl: preview ?? (imageUrl || null),
                categoryKey:
                  categories.find((category) => category.id === categoryId)
                    ?.key ?? '',
              }}
              size="large"
            />
            <div className="field">
              <span>
                Foto <small>(opcional)</small>
              </span>
              <div className="image-field-actions">
                <button
                  type="button"
                  className="ghost-button"
                  disabled={preview !== null || busy !== undefined}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {preview !== null
                    ? 'Subiendo…'
                    : imageUrl
                      ? 'Cambiar foto'
                      : 'Elegir foto'}
                </button>
                {imageUrl && preview === null && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy !== undefined}
                    onClick={() => setImageUrl('')}
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

          <label className="toggle-field">
            <span>
              Visible en la tienda
              <small>
                {active
                  ? 'Los clientes pueden verlo y pedirlo.'
                  : 'Queda guardado, pero no se muestra.'}
              </small>
            </span>
            <span className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              <span aria-hidden="true" />
            </span>
          </label>
        </div>

        <footer className="sheet-footer">
          <button
            type="submit"
            className="primary-button"
            disabled={busy !== undefined || preview !== null}
          >
            {busy === 'saving' ? 'Guardando…' : 'Guardar'}
          </button>
          {product && (
            <button
              type="button"
              className="danger-button"
              disabled={busy !== undefined}
              onClick={handleDelete}
            >
              {busy === 'deleting' ? 'Eliminando…' : 'Eliminar producto'}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  )
}
