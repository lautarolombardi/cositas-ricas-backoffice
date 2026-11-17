export interface Category {
  id: string
  key: string
  name: string
}

export interface ProductImage {
  id: string
  url: string
  position: number
}

export interface Product {
  id: string
  name: string
  images: ProductImage[]
  description: string | null
  price: number
  deletedAt: string | null
  category: Category
}

export interface ProductInput {
  name: string
  description: string | null
  price: number
  categoryId: string
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('VITE_API_URL is not set')
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  token?: string
  body?: unknown
}

async function request<T>(
  path: string,
  { method = 'GET', token, body }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const isForm = body instanceof FormData
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined || isForm ? body : JSON.stringify(body),
  })
  if (response.status === 401) {
    throw new UnauthorizedError()
  }
  if (!response.ok) {
    throw new HttpError(
      `${method} ${path} failed with status ${response.status}`,
      response.status,
    )
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

function appendProductFields(body: FormData, input: Partial<ProductInput>) {
  if (input.name !== undefined) body.append('name', input.name)
  if (input.price !== undefined) body.append('price', String(input.price))
  if (input.categoryId !== undefined) body.append('categoryId', input.categoryId)
  if (input.description !== undefined) {
    body.append('description', input.description ?? '')
  }
}

export function getCategories() {
  return request<Category[]>('/categories')
}

export async function login(password: string) {
  const { accessToken } = await request<{ accessToken: string }>(
    '/auth/login',
    { method: 'POST', body: { password } },
  )
  return accessToken
}

export function getProducts(token: string, categoryKey?: string) {
  const query = categoryKey
    ? `?${new URLSearchParams({ category: categoryKey })}`
    : ''
  return request<Product[]>(`/products/all${query}`, { token })
}

export function createProduct(
  token: string,
  input: ProductInput,
  images: Blob[] = [],
) {
  const body = new FormData()
  appendProductFields(body, input)
  for (const image of images) {
    body.append('images', image, 'photo.jpg')
  }
  return request<Product>('/products', {
    method: 'POST',
    token,
    body,
  })
}

export function updateProduct(
  token: string,
  id: string,
  input: Partial<ProductInput>,
  {
    imageIds,
    images = [],
  }: {
    /** Ordered plan: UUID to keep, null for each new upload in `images`. */
    imageIds?: (string | null)[]
    images?: Blob[]
  } = {},
) {
  const imagesTouched = imageIds !== undefined
  if (!imagesTouched) {
    return request<Product>(`/products/${id}`, {
      method: 'PATCH',
      token,
      body: input,
    })
  }

  const body = new FormData()
  appendProductFields(body, input)
  body.append('imageIds', JSON.stringify(imageIds))
  for (const image of images) {
    body.append('images', image, 'photo.jpg')
  }
  return request<Product>(`/products/${id}`, {
    method: 'PATCH',
    token,
    body,
  })
}

export function hideProduct(token: string, id: string) {
  return request<Product>(`/products/${id}`, { method: 'DELETE', token })
}

export function showProduct(token: string, id: string) {
  return request<Product>(`/products/${id}/restore`, {
    method: 'POST',
    token,
  })
}

export function deleteProduct(token: string, id: string) {
  return request<void>(`/products/${id}/permanent`, {
    method: 'DELETE',
    token,
  })
}
