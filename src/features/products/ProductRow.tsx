import type { Product } from '../../api.ts'
import { formatPrice } from '../../format.ts'
import { ProductThumb } from './ProductThumb.tsx'

interface ProductRowProps {
  product: Product
  pending: boolean
  onEdit: () => void
  onToggleActive: () => void
}

export function ProductRow({
  product,
  pending,
  onEdit,
  onToggleActive,
}: ProductRowProps) {
  return (
    <article className={`product-row${product.active ? '' : ' is-inactive'}`}>
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
          {!product.active && <span className="status-pill">Oculto</span>}
        </div>
      </button>
      <label className="switch">
        <input
          type="checkbox"
          role="switch"
          checked={product.active}
          disabled={pending}
          aria-label={`Mostrar ${product.name} en la tienda`}
          onChange={onToggleActive}
        />
        <span aria-hidden="true" />
      </label>
    </article>
  )
}
