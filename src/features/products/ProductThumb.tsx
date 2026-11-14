import { useState } from 'react'
import { ProductPlaceholder } from './ProductPlaceholder.tsx'

const PLACEHOLDER_TONES = ['rose', 'blush', 'peach', 'mauve'] as const

function placeholderTone(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PLACEHOLDER_TONES[hash % PLACEHOLDER_TONES.length]
}

interface ProductThumbProps {
  product: { id?: string; imageUrl: string | null; categoryKey: string }
  size?: 'small' | 'large'
}

export function ProductThumb({ product, size = 'small' }: ProductThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = product.imageUrl && product.imageUrl !== failedUrl

  return (
    <div
      className={`thumb thumb-${size}`}
      data-tone={showImage ? undefined : placeholderTone(product.id ?? '')}
    >
      {showImage ? (
        <img
          src={product.imageUrl!}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(product.imageUrl)}
        />
      ) : (
        <ProductPlaceholder categoryKey={product.categoryKey} />
      )}
    </div>
  )
}
