import type { MetadataRoute } from 'next'
import { getAllDocs, getManifest } from '@/lib/docs/content'
import { getAbsoluteSiteUrl } from '@/lib/docs/site'

export const dynamic = 'force-static'

function getPriority(route: string) {
  if (route === '/') {
    return 1
  }

  const segments = route.split('/').filter(Boolean)

  if (segments.length === 1) {
    return 0.92
  }

  if (route.includes('/getting-started/')) {
    return 0.9
  }

  if (route.includes('/guides/') || route.includes('/api-reference/')) {
    return 0.82
  }

  return 0.72
}

function getChangeFrequency(route: string): MetadataRoute.Sitemap[number]['changeFrequency'] {
  if (route === '/') {
    return 'weekly'
  }

  if (route.includes('/getting-started/') || route.includes('/guides/')) {
    return 'monthly'
  }

  return 'yearly'
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(getManifest().generatedAt)

  return getAllDocs()
    .map((doc) => {
      const absoluteUrl = getAbsoluteSiteUrl(doc.route)

      if (!absoluteUrl) {
        return null
      }

      return {
        url: absoluteUrl,
        lastModified,
        changeFrequency: getChangeFrequency(doc.route),
        priority: getPriority(doc.route),
      }
    })
    .filter(Boolean) as MetadataRoute.Sitemap
}
