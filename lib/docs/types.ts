export type DocSection = 'root' | 'app' | 'architecture' | 'community'

export interface RelatedFrontmatter {
  title?: string
  description?: string
  links?: string[]
}

export interface DocFrontmatter {
  title: string
  description: string
  nav_title?: string
  version?: string
  related?: RelatedFrontmatter
}

export interface DocHeading {
  depth: number
  text: string
  id: string
}

export interface ManifestEntry {
  sourcePath: string
  sourceUrl: string
  githubUrl?: string
  rawUrl?: string
  targetPath: string
  section: DocSection
  route: string
  routeSegments: string[]
  sha?: string
  sha256?: string
}

export interface ManifestData {
  version: string
  generatedAt: string
  count: number
  entries: ManifestEntry[]
}

export interface RelatedItem {
  href: string
  title: string
  description?: string
  external?: boolean
}

export interface DocRecord {
  id: string
  route: string
  slug: string[]
  section: DocSection
  sourcePath: string
  targetPath: string
  sourceUrl: string
  githubUrl?: string
  frontmatter: DocFrontmatter
  body: string
  headings: DocHeading[]
  prev?: Pick<DocRecord, 'route' | 'frontmatter'>
  next?: Pick<DocRecord, 'route' | 'frontmatter'>
  relatedItems: RelatedItem[]
}

export interface NavNode {
  key: string
  title: string
  route?: string
  kind: 'section' | 'folder' | 'doc'
  children: NavNode[]
}

export interface BreadcrumbItem {
  title: string
  route: string
}

export interface SearchRecord {
  id: string
  route: string
  title: string
  description: string
  headings: string[]
  body: string
  excerpt: string
  section: DocSection
}
