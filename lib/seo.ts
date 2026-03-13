import type { Metadata } from 'next'
import type { BreadcrumbItem, DocRecord, DocSection } from '@/lib/docs/types'
import {
  getAbsoluteSiteUrl,
  getSiteOrigin,
  SECTION_FALLBACK_TITLES,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_LANGUAGE,
  SITE_LOCALE,
  SITE_NAME,
  SITE_OG_IMAGE_PATH,
} from '@/lib/docs/site'

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

function getSocialImageUrl() {
  const origin = getSiteOrigin()
  if (!origin) {
    return undefined
  }

  return `${origin}${SITE_OG_IMAGE_PATH}`
}

function getSectionLabel(section: DocSection) {
  if (section === 'root') {
    return '문서'
  }

  return SECTION_FALLBACK_TITLES[section]
}

function buildCommonMetadata({
  title,
  description,
  route,
  keywords,
  type,
}: {
  title: Metadata['title']
  description: string
  route: string
  keywords?: string[]
  type: 'website' | 'article'
}): Metadata {
  const canonical = getAbsoluteSiteUrl(route) ?? undefined
  const socialImage = getSocialImageUrl()

  return {
    title,
    description,
    category: 'technology',
    keywords: unique([...(keywords ?? []), ...SITE_KEYWORDS]),
    alternates: canonical
      ? {
          canonical,
          languages: {
            ko: canonical,
            'ko-KR': canonical,
          },
        }
      : undefined,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type,
      locale: SITE_LOCALE,
      siteName: SITE_NAME,
      title: typeof title === 'string' ? title : SITE_NAME,
      description,
      url: canonical,
      images: socialImage
        ? [
            {
              url: socialImage,
              width: 1200,
              height: 630,
              alt: SITE_NAME,
            },
          ]
        : undefined,
    },
    twitter: {
      card: socialImage ? 'summary_large_image' : 'summary',
      title: typeof title === 'string' ? title : SITE_NAME,
      description,
      images: socialImage ? [socialImage] : undefined,
    },
  }
}

export function buildHomeMetadata(description = SITE_DESCRIPTION): Metadata {
  return buildCommonMetadata({
    title: { absolute: SITE_NAME },
    description,
    route: '/',
    keywords: ['Next.js 문서', 'Next.js 한국어 번역', 'App Router 한국어 문서'],
    type: 'website',
  })
}

export function buildDocMetadata(doc: DocRecord): Metadata {
  return buildCommonMetadata({
    title: doc.frontmatter.title,
    description: doc.frontmatter.description || SITE_DESCRIPTION,
    route: doc.route,
    keywords: unique([
      doc.frontmatter.title,
      doc.frontmatter.nav_title,
      getSectionLabel(doc.section),
      ...doc.headings.slice(0, 8).map((heading) => heading.text),
    ]),
    type: doc.route === '/' ? 'website' : 'article',
  })
}

export function buildWebSiteJsonLd() {
  const homepage = getAbsoluteSiteUrl('/')

  if (!homepage) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    url: homepage,
    keywords: SITE_KEYWORDS.join(', '),
  }
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  const entries = [{ title: '홈', route: '/' }, ...items]
    .map((item, index) => {
      const url = getAbsoluteSiteUrl(item.route)
      if (!url) {
        return null
      }

      return {
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        item: url,
      }
    })
    .filter(Boolean)

  if (entries.length === 0) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: entries,
  }
}

export function buildDocJsonLd(doc: DocRecord) {
  const url = getAbsoluteSiteUrl(doc.route)
  const websiteUrl = getAbsoluteSiteUrl('/')

  if (!url || !websiteUrl) {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': doc.route === '/' ? 'WebPage' : 'TechArticle',
    headline: doc.frontmatter.title,
    description: doc.frontmatter.description || SITE_DESCRIPTION,
    inLanguage: SITE_LANGUAGE,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: websiteUrl,
    },
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    about: unique(['Next.js', getSectionLabel(doc.section), doc.frontmatter.title]),
  }
}

export function stringifyJsonLd(payload: object) {
  return JSON.stringify(payload).replace(/</g, '\\u003c')
}
