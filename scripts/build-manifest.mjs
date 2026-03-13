#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TAG = 'v16.1.6'
const EXPECTED_COUNT = 231
const REPO = 'vercel/next.js'
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${TAG}?recursive=1`
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO}/${TAG}`
const OUTPUT_PATH = path.join(process.cwd(), 'docs-ko/_meta/manifest.json')

const DOC_PATTERNS = [
  /^docs\/index\.mdx$/,
  /^docs\/01-app\/.+\.mdx$/,
  /^docs\/03-architecture\/.+\.mdx$/,
  /^docs\/04-community\/.+\.mdx$/,
]

function stripNumericPrefix(segment) {
  return segment.replace(/^\d+-/, '')
}

function getSection(sourcePath) {
  if (sourcePath === 'docs/index.mdx') {
    return 'root'
  }

  if (sourcePath.startsWith('docs/01-app/')) {
    return 'app'
  }

  if (sourcePath.startsWith('docs/03-architecture/')) {
    return 'architecture'
  }

  if (sourcePath.startsWith('docs/04-community/')) {
    return 'community'
  }

  throw new Error(`Unable to determine section for path: ${sourcePath}`)
}

function toRouteMetadata(sourcePath) {
  if (sourcePath === 'docs/index.mdx') {
    return {
      route: '/docs',
      targetPath: 'docs-ko/index.mdx',
      routeSegments: [],
    }
  }

  const [, ...rawSegments] = sourcePath.split('/')
  const fileName = rawSegments.pop()

  if (!fileName) {
    throw new Error(`Invalid source path: ${sourcePath}`)
  }

  const normalizedDirs = rawSegments.map(stripNumericPrefix)
  const baseName = stripNumericPrefix(fileName.replace(/\.mdx$/, ''))
  const isIndex = baseName === 'index'
  const routeSegments = isIndex ? normalizedDirs : [...normalizedDirs, baseName]
  const targetPath = isIndex
    ? path.posix.join('docs-ko', ...normalizedDirs, 'index.mdx')
    : path.posix.join('docs-ko', ...normalizedDirs, `${baseName}.mdx`)

  return {
    route: `/docs/${routeSegments.join('/')}`.replace(/\/+$/, ''),
    targetPath,
    routeSegments,
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'nextjs-docs-ko-manifest-builder',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed: ${url}\n${response.status} ${response.statusText}\n${body}`)
  }

  return response.json()
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'nextjs-docs-ko-manifest-builder',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Request failed: ${url}\n${response.status} ${response.statusText}\n${body}`)
  }

  return response.text()
}

async function mapWithConcurrency(items, mapper, concurrency = 6) {
  const results = new Array(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  })

  await Promise.all(workers)
  return results
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function main() {
  const tree = await fetchJson(TREE_URL)

  if (!Array.isArray(tree.tree)) {
    throw new Error('GitHub tree response did not include a tree array')
  }

  const docEntries = tree.tree
    .filter((entry) => entry.type === 'blob' && DOC_PATTERNS.some((pattern) => pattern.test(entry.path)))
    .sort((a, b) => a.path.localeCompare(b.path))

  if (docEntries.length !== EXPECTED_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_COUNT} documentation files for ${TAG}, found ${docEntries.length}`
    )
  }

  const manifest = await mapWithConcurrency(docEntries, async (entry) => {
    const { route, targetPath, routeSegments } = toRouteMetadata(entry.path)
    const rawUrl = `${RAW_BASE_URL}/${entry.path}`
    const content = await fetchText(rawUrl)

    return {
      sourcePath: entry.path,
      sourceUrl: `https://nextjs.org${route}`,
      githubUrl: `https://github.com/${REPO}/blob/${TAG}/${entry.path}`,
      rawUrl,
      targetPath,
      section: getSection(entry.path),
      route,
      routeSegments,
      sha: entry.sha,
      sha256: sha256(content),
    }
  })

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(
    OUTPUT_PATH,
    `${JSON.stringify(
      {
        version: TAG,
        generatedAt: new Date().toISOString(),
        count: manifest.length,
        entries: manifest,
      },
      null,
      2
    )}\n`
  )

  console.log(`Wrote ${manifest.length} manifest entries to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
