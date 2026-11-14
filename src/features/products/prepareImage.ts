export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const MAX_DIMENSION = 1600

/**
 * Scales a photo down to at most MAX_DIMENSION pixels per side and re-encodes it
 * as JPEG. Keeps the original when it's already small, or when re-encoding
 * wouldn't make it lighter (e.g. a small PNG with transparency).
 */
export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const keepOriginal =
    scale === 1 && IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE / 5
  if (keepOriginal) {
    bitmap.close()
    return file
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const resized = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  )
  if (!resized) throw new Error('Could not encode the image')
  const originalFits =
    IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE
  return originalFits && file.size <= resized.size ? file : resized
}
