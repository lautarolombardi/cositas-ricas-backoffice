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
  deletedAt: string | null
  category: Category
}

export interface ProductInput {
  name: string
  description: string | null
  imageUrl: string | null
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

function appendProductFields(
  body: FormData,
  input: Partial<ProductInput>,
  { clearImage = false }: { clearImage?: boolean } = {},
) {
  if (input.name !== undefined) body.append('name', input.name)
  if (input.price !== undefined) body.append('price', String(input.price))
  if (input.categoryId !== undefined) body.append('categoryId', input.categoryId)
  if (input.description !== undefined) {
    body.append('description', input.description ?? '')
  }
  if (clearImage) body.append('imageUrl', '')
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
  image?: Blob,
) {
  const body = new FormData()
  appendProductFields(body, input)
  if (image) body.append('image', image, 'photo.jpg')
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
  image?: Blob,
) {
  // Multipart when attaching a new photo or clearing imageUrl in the same request.
  const needsMultipart = image !== undefined || input.imageUrl === null
  if (!needsMultipart) {
    return request<Product>(`/products/${id}`, {
      method: 'PATCH',
      token,
      body: input,
    })
  }

  const body = new FormData()
  appendProductFields(body, input, {
    clearImage: input.imageUrl === null && !image,
  })
  if (image) body.append('image', image, 'photo.jpg')
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
