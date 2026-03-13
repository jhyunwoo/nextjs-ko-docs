import type { MetadataRoute } from 'next'
import { getAbsoluteSiteUrl, getSiteOrigin } from '@/lib/docs/site'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin()
  const sitemap = getAbsoluteSiteUrl('/sitemap.xml')

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: sitemap ? [sitemap] : undefined,
    host: origin ?? undefined,
  }
}
