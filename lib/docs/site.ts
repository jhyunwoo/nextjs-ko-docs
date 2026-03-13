export const SITE_NAME = 'Next.js 한국어 문서'
export const SITE_DESCRIPTION =
  'Next.js v16.1.6 App Router 문서를 한국어로 제공하는 정적 문서 사이트입니다.'
export const SITE_VERSION = 'v16.1.6'
export const SITE_LOCALE = 'ko_KR'
export const SITE_LANGUAGE = 'ko-KR'
export const SITE_OG_IMAGE_PATH = '/og-cover.svg'
export const SITE_KEYWORDS = [
  'Next.js',
  'Next.js 한국어 문서',
  'Next.js App Router',
  'App Router 문서',
  'Next.js 번역',
  'React 프레임워크 문서',
  '정적 문서 사이트',
] as const

export const SECTION_FALLBACK_TITLES = {
  app: 'App Router',
  architecture: '아키텍처',
  community: '커뮤니티',
} as const

export function getSiteOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (!raw) {
    return null
  }

  try {
    const url = new URL(raw)
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export function getAbsoluteSiteUrl(route: string) {
  const origin = getSiteOrigin()

  if (!origin) {
    return null
  }

  if (!route || route === '/') {
    return `${origin}/`
  }

  const normalizedPath = route.startsWith('/') ? route : `/${route}`
  if (/\/[^/]+\.[a-z0-9]+$/i.test(normalizedPath)) {
    return `${origin}${normalizedPath}`
  }

  const withTrailingSlash = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`
  return `${origin}${withTrailingSlash}`
}
