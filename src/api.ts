export interface Category {
  id: string
  key: string
  name: string
}

export interface Product {
  id: string
  name: string
  imageUrl: string | null
  description: string | null
  price: number
  active: boolean
  category: Category
}

export interface ProductInput {
  name: string
  description: string | null
  imageUrl: string | null
  price: number
  categoryId: string
  active: boolean
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

export function createProduct(token: string, input: ProductInput) {
  return request<Product>('/products', {
    method: 'POST',
    token,
    body: input,
  })
}

export async function uploadProductImage(token: string, image: Blob) {
  const body = new FormData()
  body.append('image', image)
  const { imageUrl } = await request<{ imageUrl: string }>('/products/images', {
    method: 'POST',
    token,
    body,
  })
  return imageUrl
}

export function updateProduct(
  token: string,
  id: string,
  input: Partial<ProductInput>,
) {
  return request<Product>(`/products/${id}`, {
    method: 'PATCH',
    token,
    body: input,
  })
}

export function deleteProduct(token: string, id: string) {
  return request<void>(`/products/${id}`, { method: 'DELETE', token })
}
