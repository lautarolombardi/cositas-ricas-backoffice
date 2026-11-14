import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createProduct,
  deleteProduct,
  getCategories,
  getProducts,
  hideProduct,
  showProduct,
  UnauthorizedError,
  updateProduct,
} from '../../api.ts'
import type { Product } from '../../api.ts'
import { toast } from 'sonner'
import {
  ProductFormSheet,
  type ProductSavePayload,
} from './ProductFormSheet.tsx'
import { ProductRow } from './ProductRow.tsx'

const ALL_CATEGORIES = 'all'
const TOGGLE_VISIBILITY_KEY = ['products', 'toggle-visibility']

function sortByName(products: Product[]) {
  return products.toSorted((a, b) => a.name.localeCompare(b.name, 'es'))
}

interface ProductsPageProps {
  token: string
  onUnauthorized: () => void
}

export function ProductsPage({ token, onUnauthorized }: ProductsPageProps) {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const categoryKey =
    categoryFilter === ALL_CATEGORIES ? undefined : categoryFilter
  const productsKey = ['products', token, categoryFilter]
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
  const productsQuery = useQuery({
    queryKey: productsKey,
    queryFn: () => getProducts(token, categoryKey).then(sortByName),
    placeholderData: keepPreviousData,
  })
  const categories = categoriesQuery.data ?? []
  const products = productsQuery.data ?? []
  const queries = [categoriesQuery, productsQuery]
  const status = queries.some((query) => query.isError && !query.isFetching)
    ? 'error'
    : queries.every((query) => query.isSuccess)
      ? 'success'
      : 'loading'

  const unauthorized = queries.some(
    (query) => query.error instanceof UnauthorizedError,
  )
  useEffect(() => {
    if (unauthorized) onUnauthorized()
  }, [unauthorized, onUnauthorized])

  function handleMutationError(error: Error) {
    if (error instanceof UnauthorizedError) onUnauthorized()
  }

  function upsert(saved: Product) {
    queryClient.setQueryData<Product[]>(productsKey, (current = []) => {
      const others = current.filter((p) => p.id !== saved.id)
      return !categoryKey || saved.category.key === categoryKey
        ? sortByName([...others, saved])
        : others
    })
  }

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      input,
      image,
      visible,
    }: { id?: string } & ProductSavePayload) => {
      let saved = id
        ? await updateProduct(token, id, input, image)
        : await createProduct(token, input, image)
      const isHidden = saved.deletedAt != null
      if (visible && isHidden) {
        saved = await showProduct(token, saved.id)
      } else if (!visible && !isHidden) {
        saved = await hideProduct(token, saved.id)
      }
      return saved
    },
    onSuccess: (saved, { id }) => {
      upsert(saved)
      toast.success(
        id
          ? `“${saved.name}” se guardó correctamente.`
          : `“${saved.name}” se creó correctamente.`,
      )
      setEditing(null)
    },
    onError: handleMutationError,
  })

  const deleteMutation = useMutation({
    mutationFn: (product: Product) => deleteProduct(token, product.id),
    onSuccess: (_, product) => {
      queryClient.setQueryData<Product[]>(productsKey, (current = []) =>
        current.filter((p) => p.id !== product.id),
      )
      setEditing(null)
      toast.success(`“${product.name}” se eliminó.`)
    },
    onError: handleMutationError,
  })

  const toggleVisibilityMutation = useMutation({
    mutationKey: TOGGLE_VISIBILITY_KEY,
    mutationFn: (product: Product) =>
      product.deletedAt == null
        ? hideProduct(token, product.id)
        : showProduct(token, product.id),
    onSuccess: (saved) => {
      upsert(saved)
      if (saved.deletedAt == null) {
        toast.success(`“${saved.name}” ahora se muestra en la tienda.`)
      } else {
        toast.info(`“${saved.name}” quedó oculto en la tienda.`)
      }
    },
    onError: (error, product) => {
      if (error instanceof UnauthorizedError) {
        onUnauthorized()
        return
      }
      console.error(error)
      toast.error(
        `No pudimos ${product.deletedAt == null ? 'ocultar' : 'mostrar'} “${product.name}”. Probá de nuevo.`,
      )
    },
  })
  const pendingIds = new Set(
    useMutationState({
      filters: { mutationKey: TOGGLE_VISIBILITY_KEY, status: 'pending' },
      select: (mutation) => (mutation.state.variables as Product).id,
    }),
  )

  async function handleSave(payload: ProductSavePayload) {
    await saveMutation.mutateAsync({
      id: editing && editing !== 'new' ? editing.id : undefined,
      ...payload,
    })
  }

  async function handleDelete(product: Product) {
    await deleteMutation.mutateAsync(product)
  }

  function handleRetry() {
    for (const query of queries) {
      if (query.isError) void query.refetch()
    }
  }

  const hiddenCount = products.filter(
    (product) => product.deletedAt != null,
  ).length

  return (
    <>
      <div className="toolbar">
        <div className="toolbar-inner">
          <ul className="chip-list" aria-label="Filtrar por categoría">
            {[{ key: ALL_CATEGORIES, name: 'Todas' }, ...categories].map(
              (category) => (
                <li key={category.key}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={categoryFilter === category.key}
                    onClick={() => setCategoryFilter(category.key)}
                  >
                    {category.name}
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>

      <main className="page">
        <div className="page-heading">
          <h1>Productos</h1>
          {status === 'success' && (
            <span>
              {`${products.length} en total`}
              {hiddenCount > 0 &&
                ` · ${hiddenCount} ${hiddenCount === 1 ? 'oculto' : 'ocultos'}`}
            </span>
          )}
        </div>

        {status === 'loading' && (
          <ul className="product-rows" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="row-skeleton" />
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="empty-state">
            <p>No pudimos cargar los productos.</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleRetry}
            >
              Reintentar
            </button>
          </div>
        )}

        {status === 'success' &&
          (products.length === 0 ? (
            <p className="empty-state">
              {categoryKey
                ? 'Todavía no hay productos en esta categoría.'
                : 'Todavía no cargaste productos.'}
            </p>
          ) : (
            <ul className="product-rows">
              {products.map((product) => (
                <li key={product.id}>
                  <ProductRow
                    product={product}
                    pending={pendingIds.has(product.id)}
                    onEdit={() => setEditing(product)}
                    onToggleVisibility={() =>
                      toggleVisibilityMutation.mutate(product)
                    }
                  />
                </li>
              ))}
            </ul>
          ))}
      </main>

      {status === 'success' && (
        <div className="fab-bar">
          <button
            type="button"
            className="fab"
            onClick={() => setEditing('new')}
          >
            <span aria-hidden="true">+</span> Nuevo producto
          </button>
        </div>
      )}

      {editing && (
        <ProductFormSheet
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          categories={categories}
          defaultCategoryId={
            categories.find((c) => c.key === categoryFilter)?.id ??
            categories[0]?.id
          }
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
