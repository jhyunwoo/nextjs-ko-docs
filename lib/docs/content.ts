import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import { cache } from 'react'
import { unified } from 'unified'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import {
  normalizeSiteRoute,
  resolveRelatedLink,
  toSiteRouteFromManifestRoute,
  type RouteMap,
} from '@/lib/docs/routes'
import type {
  BreadcrumbItem,
  DocFrontmatter,
  DocHeading,
  DocRecord,
  ManifestData,
  ManifestEntry,
  NavNode,
  RelatedItem,
} from '@/lib/docs/types'
import { SECTION_FALLBACK_TITLES } from '@/lib/docs/site'

const DOCS_ROOT = path.join(process.cwd(), 'docs-ko')
const MANIFEST_PATH = path.join(DOCS_ROOT, '_meta', 'manifest.json')

type MutableNavNode = {
  key: string
  title: string
  route?: string
  kind: 'section' | 'folder' | 'doc'
  children: Map<string, MutableNavNode>
  order: number
}

export const getManifest = cache(() => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8')
  return JSON.parse(raw) as ManifestData
})

export const getTargetPathToRouteMap = cache(() => {
  const map: RouteMap = new Map()

  for (const entry of getManifest().entries) {
    map.set(entry.targetPath, normalizeSiteRoute(toSiteRouteFromManifestRoute(entry.route)))
  }

  return map
})

export const getAllDocs = cache(() => {
  const routeMap = getTargetPathToRouteMap()
  const baseDocs = getManifest().entries.map((entry, index) => {
    const absolutePath = path.join(process.cwd(), entry.targetPath)
    const file = fs.readFileSync(absolutePath, 'utf8')
    const { content, data } = matter(file)
    const body = cleanDocSource(content)
    const route = normalizeSiteRoute(toSiteRouteFromManifestRoute(entry.route))
    const slug = route === '/' ? [] : route.slice(1).split('/')
    const frontmatter = normalizeFrontmatter(data)
    const headings = extractHeadings(body)

    const doc: DocRecord = {
      id: `${index}:${route}`,
      route,
      slug,
      section: entry.section,
      sourcePath: entry.sourcePath,
      targetPath: entry.targetPath,
      sourceUrl: entry.sourceUrl,
      githubUrl: entry.githubUrl,
      frontmatter,
      body,
      headings,
      relatedItems: [],
    }

    return doc
  })

  const docByRoute = new Map(baseDocs.map((doc) => [doc.route, doc]))

  return baseDocs.map((doc) => ({
    ...doc,
    relatedItems: buildRelatedItems(doc.frontmatter, routeMap, docByRoute),
  }))
})

export const getDocByRoute = cache((route: string) => {
  const normalized = normalizeSiteRoute(route)
  return getAllDocs().find((doc) => doc.route === normalized)
})

export const getStaticSlugs = cache(() =>
  getAllDocs()
    .filter((doc) => doc.route !== '/')
    .map((doc) => ({ slug: doc.slug })),
)

export const getNavigationTree = cache(() => {
  const roots = new Map<string, MutableNavNode>()
  let orderCounter = 0

  for (const doc of getAllDocs()) {
    if (doc.route === '/') {
      continue
    }

    let cursor = roots
    const segments = doc.slug
    const isIndexDoc = doc.targetPath.endsWith('/index.mdx')

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const accumulatedRoute = `/${segments.slice(0, index + 1).join('/')}`

      let node = cursor.get(segment)
      if (!node) {
        node = {
          key: accumulatedRoute,
          title: humanizeSegment(segment),
          route: accumulatedRoute,
          kind: index === 0 ? 'section' : 'folder',
          children: new Map(),
          order: orderCounter,
        }
        cursor.set(segment, node)
        orderCounter += 1
      }

      if (index === segments.length - 1) {
        node.route = doc.route
        node.title = doc.frontmatter.nav_title ?? doc.frontmatter.title
        node.kind = isIndexDoc ? (index === 0 ? 'section' : 'folder') : 'doc'
      }

      cursor = node.children
    }
  }

  const tree = Array.from(roots.values())
    .sort((left, right) => left.order - right.order)
    .map(toNavNode)

  return tree.map((node) => {
    if (node.kind === 'section' && !node.title.trim()) {
      return { ...node, title: SECTION_FALLBACK_TITLES[node.key.slice(1) as keyof typeof SECTION_FALLBACK_TITLES] }
    }
    return node
  })
})

export function getDocWithContext(route: string) {
  const docs = getAllDocs()
  const docIndex = docs.findIndex((doc) => doc.route === normalizeSiteRoute(route))

  if (docIndex === -1) {
    return null
  }

  const doc = docs[docIndex]
  const prev = docs[docIndex - 1]
  const next = docs[docIndex + 1]

  return {
    ...doc,
    prev: prev
      ? {
          route: prev.route,
          frontmatter: prev.frontmatter,
        }
      : undefined,
    next: next
      ? {
          route: next.route,
          frontmatter: next.frontmatter,
        }
      : undefined,
  } satisfies DocRecord
}

export function getBreadcrumbs(route: string) {
  const doc = getDocByRoute(route)
  if (!doc || doc.route === '/') {
    return [] satisfies BreadcrumbItem[]
  }

  const breadcrumbs: BreadcrumbItem[] = []
  const docs = getAllDocs()
  const docMap = new Map(docs.map((item) => [item.route, item]))

  for (let index = 0; index < doc.slug.length; index += 1) {
    const currentRoute = `/${doc.slug.slice(0, index + 1).join('/')}`
    const currentDoc = docMap.get(currentRoute)
    if (!currentDoc) {
      continue
    }

    breadcrumbs.push({
      title: currentDoc.frontmatter.nav_title ?? currentDoc.frontmatter.title,
      route: currentRoute,
    })
  }

  return breadcrumbs
}

function cleanDocSource(source: string) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<PagesOnly>[\s\S]*?<\/PagesOnly>/g, '')
    .replace(/<\/?AppOnly>/g, '')
    .trim()
}

function normalizeFrontmatter(data: Record<string, unknown>) {
  const frontmatter = data as unknown as Partial<DocFrontmatter>
  return {
    title: frontmatter.title ?? '문서',
    description: frontmatter.description ?? '',
    nav_title: frontmatter.nav_title,
    version: frontmatter.version,
    related: frontmatter.related,
  } satisfies DocFrontmatter
}

function buildRelatedItems(
  frontmatter: DocFrontmatter,
  routeMap: RouteMap,
  docByRoute: Map<string, DocRecord>,
) {
  const links = frontmatter.related?.links ?? []

  return links
    .map((link) => {
      const href = resolveRelatedLink(link, routeMap)
      const localDoc = docByRoute.get(href)
      const item: RelatedItem = {
        href,
        title: localDoc?.frontmatter.title ?? humanizeSegment(link.split('/').pop() ?? link),
        description: localDoc?.frontmatter.description,
        external: href.startsWith('http'),
      }
      return item
    })
    .filter(Boolean)
}

function extractHeadings(source: string) {
  const slugger = new GithubSlugger()
  const headings: DocHeading[] = []

  try {
    const tree = unified().use(remarkParse).use(remarkMdx).parse(source)

    visit(tree, 'heading', (node: any) => {
      const text = collapseText(node).trim()
      if (!text) {
        return
      }

      headings.push({
        depth: node.depth,
        text,
        id: slugger.slug(text),
      })
    })
  } catch {
    return headings
  }

  return headings
}

function collapseText(node: any): string {
  if (!node) {
    return ''
  }

  if (typeof node.value === 'string') {
    return node.value
  }

  if (typeof node.alt === 'string') {
    return node.alt
  }

  if (Array.isArray(node.children)) {
    return node.children.map(collapseText).join('')
  }

  if (Array.isArray(node.attributes)) {
    const textAttribute = node.attributes.find(
      (attribute: any) =>
        attribute?.type === 'mdxJsxAttribute' &&
        (attribute.name === 'alt' || attribute.name === 'caption') &&
        typeof attribute.value === 'string',
    )

    if (textAttribute?.value) {
      return textAttribute.value
    }
  }

  return ''
}

function toNavNode(node: MutableNavNode): NavNode {
  return {
    key: node.key,
    title: node.title,
    route: node.route,
    kind: node.kind,
    children: Array.from(node.children.values())
      .sort((left, right) => left.order - right.order)
      .map(toNavNode),
  }
}

function humanizeSegment(value: string) {
  return value
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getRootDoc() {
  return getDocWithContext('/')
}

export function getSectionDocs() {
  return getAllDocs().filter((doc) => doc.route !== '/')
}

export function getPrimarySections() {
  return getNavigationTree().filter((node) => node.kind === 'section')
}
