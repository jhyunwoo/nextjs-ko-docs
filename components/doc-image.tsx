'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface DocImageProps {
  alt: string
  src?: string
  srcLight?: string
  srcDark?: string
  width?: string | number
  height?: string | number
}

export function DocImage({ alt, src, srcLight, srcDark, width, height }: DocImageProps) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const themeSource = mounted && resolvedTheme === 'dark' ? srcDark : srcLight
  const selectedSource = src ?? themeSource ?? srcLight ?? srcDark

  if (!selectedSource) {
    return null
  }

  return (
    <img
      src={selectedSource}
      alt={alt}
      width={width}
      height={height}
      className="doc-image"
      loading="lazy"
      decoding="async"
    />
  )
}
