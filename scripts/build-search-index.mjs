import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import { unified } from 'unified'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'

const ROOT_DIR = process.cwd()
const DOCS_DIR = path.join(ROOT_DIR, 'docs-ko')
const MANIFEST_PATH = path.join(DOCS_DIR, '_meta', 'manifest.json')
const OUTPUT_PATH = path.join(ROOT_DIR, 'public', 'search-index.json')

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

const records = manifest.entries.map((entry, index) => {
  const absolutePath = path.join(ROOT_DIR, entry.targetPath)
  const raw = fs.readFileSync(absolutePath, 'utf8')
  const { content, data } = matter(raw)
  const cleaned = cleanSource(content)
  const headings = extractHeadings(cleaned)
  const body = extractPlainText(cleaned)
  const excerpt = body.slice(0, 220).trim()

  return {
    id: `${index}:${entry.targetPath}`,
    route: toSiteRoute(entry.route),
    title: data.title ?? '문서',
    description: data.description ?? '',
    headings,
    body,
    excerpt,
    section: entry.section,
  }
})

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2))

console.log(`Search index written: ${OUTPUT_PATH}`)
console.log(`Indexed documents: ${records.length}`)

function cleanSource(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<PagesOnly>[\s\S]*?<\/PagesOnly>/g, '')
    .replace(/<\/?AppOnly>/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
}

function extractHeadings(source) {
  const headings = []
  const slugger = new GithubSlugger()

  try {
    const tree = unified().use(remarkParse).use(remarkMdx).parse(source)
    visit(tree, 'heading', (node) => {
      const text = collapseText(node).trim()
      if (!text) {
        return
      }

      headings.push({
        id: slugger.slug(text),
        text,
        depth: node.depth,
      })
    })
  } catch {
    return []
  }

  return headings.map((heading) => heading.text)
}

function extractPlainText(source) {
  try {
    const tree = unified().use(remarkParse).use(remarkMdx).parse(source)
    const chunks = []

    visit(tree, (node) => {
      if (node.type === 'text' || node.type === 'inlineCode') {
        chunks.push(node.value)
      }

      if (
        (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
        Array.isArray(node.attributes)
      ) {
        for (const attribute of node.attributes) {
          if (
            attribute?.type === 'mdxJsxAttribute' &&
            (attribute.name === 'alt' || attribute.name === 'caption') &&
            typeof attribute.value === 'string'
          ) {
            chunks.push(attribute.value)
          }
        }
      }
    })

    return chunks.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return source.replace(/\s+/g, ' ').trim()
  }
}

function collapseText(node) {
  if (!node) {
    return ''
  }

  if (typeof node.value === 'string') {
    return node.value
  }

  if (Array.isArray(node.children)) {
    return node.children.map(collapseText).join('')
  }

  return ''
}

function toSiteRoute(route) {
  if (route === '/docs') {
    return '/'
  }

  if (
    route.startsWith('/docs/app') ||
    route.startsWith('/docs/architecture') ||
    route.startsWith('/docs/community')
  ) {
    return route.replace('/docs', '')
  }

  return `https://nextjs.org${route}`
}
