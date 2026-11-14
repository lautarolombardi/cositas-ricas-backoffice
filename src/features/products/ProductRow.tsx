import type { Product } from '../../api.ts'
import { formatPrice } from '../../format.ts'
import { ProductThumb } from './ProductThumb.tsx'

interface ProductRowProps {
  product: Product
  pending: boolean
  onEdit: () => void
  onToggleVisibility: () => void
}

export function ProductRow({
  product,
  pending,
  onEdit,
  onToggleVisibility,
}: ProductRowProps) {
  const visible = product.deletedAt == null

  return (
    <article className={`product-row${visible ? '' : ' is-inactive'}`}>
      <button
        type="button"
        className="product-row-main"
        aria-label={`Editar ${product.name}`}
        onClick={onEdit}
      >
        <ProductThumb
          product={{
            id: product.id,
            imageUrl: product.imageUrl,
            categoryKey: product.category.key,
          }}
        />
        <div className="product-row-body">
          <h2>{product.name}</h2>
          <p>
            {product.category.name} · <strong>{formatPrice(product.price)}</strong>
          </p>
          {!visible && <span className="status-pill">Oculto</span>}
        </div>
      </button>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={visible}
          disabled={pending}
          aria-label={`Mostrar ${product.name} en la tienda`}
          onChange={onToggleVisibility}
        />
        <span aria-hidden="true" />
      </label>
    </article>
  )
}
