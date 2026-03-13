import path from 'node:path'

export type RouteMap = Map<string, string>

const DOC_SECTION_PREFIXES = ['/docs/app', '/docs/architecture', '/docs/community']

export function toSiteRouteFromManifestRoute(route: string) {
  if (route === '/docs') {
    return '/'
  }

  for (const prefix of DOC_SECTION_PREFIXES) {
    if (route.startsWith(prefix)) {
      return route.replace('/docs', '')
    }
  }

  return `https://nextjs.org${route}`
}

export function normalizeSiteRoute(route: string) {
  if (!route || route === '/') {
    return '/'
  }

  return route.endsWith('/') ? route.slice(0, -1) : route
}

function splitHash(value: string) {
  const [pathname, hash] = value.split('#')
  return { pathname, hash: hash ? `#${hash}` : '' }
}

function appendHash(route: string, hash: string) {
  return hash ? `${route}${hash}` : route
}

function hasScheme(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value)
}

function toAbsoluteNextUrl(pathname: string) {
  return `https://nextjs.org${pathname}`
}

export function resolveRelatedLink(link: string, targetPathToRoute: RouteMap) {
  if (!link) {
    return '#'
  }

  if (hasScheme(link) || link.startsWith('#')) {
    return link
  }

  if (link.startsWith('/app') || link.startsWith('/architecture') || link.startsWith('/community')) {
    return normalizeSiteRoute(link)
  }

  if (link.startsWith('/docs')) {
    const local = toSiteRouteFromManifestRoute(link)
    return local.startsWith('http') ? local : normalizeSiteRoute(local)
  }

  if (link.startsWith('/')) {
    return toAbsoluteNextUrl(link)
  }

  const rootRelative = resolveFromCandidates(`docs-ko/${link}`, targetPathToRoute)
  return rootRelative ?? toAbsoluteNextUrl(`/docs/${link}`)
}

export function resolveDocHref(
  currentTargetPath: string,
  href: string,
  targetPathToRoute: RouteMap,
) {
  if (!href || href.startsWith('#') || hasScheme(href)) {
    return href
  }

  const { pathname, hash } = splitHash(href)

  if (!pathname) {
    return href
  }

  if (pathname.startsWith('/app') || pathname.startsWith('/architecture') || pathname.startsWith('/community')) {
    return appendHash(normalizeSiteRoute(pathname), hash)
  }

  if (pathname.startsWith('/docs')) {
    const local = toSiteRouteFromManifestRoute(pathname)
    return appendHash(local.startsWith('http') ? local : normalizeSiteRoute(local), hash)
  }

  if (pathname.startsWith('/')) {
    return appendHash(toAbsoluteNextUrl(pathname), hash)
  }

  const baseDir = path.posix.dirname(currentTargetPath)
  const resolved = resolveFromCandidates(
    path.posix.normalize(path.posix.join(baseDir, pathname)),
    targetPathToRoute,
  )

  if (resolved) {
    return appendHash(resolved, hash)
  }

  return href
}

function resolveFromCandidates(rawPath: string, targetPathToRoute: RouteMap) {
  const normalized = rawPath.replace(/\\/g, '/')
  const candidates = new Set<string>()

  if (normalized.endsWith('.mdx')) {
    candidates.add(normalized)
  } else {
    candidates.add(`${normalized}.mdx`)
    candidates.add(path.posix.join(normalized, 'index.mdx'))
  }

  for (const candidate of candidates) {
    const route = targetPathToRoute.get(candidate)
    if (route) {
      return route
    }
  }

  return null
}
