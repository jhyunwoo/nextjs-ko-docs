import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = process.cwd()
const DOCS_DIR = path.join(ROOT_DIR, 'docs-ko')
const PUBLIC_DIR = path.join(ROOT_DIR, 'public')
const BASE_URL = 'https://nextjs.org'
const CONCURRENCY = 6
const DISCOVERY_PAGES = [
  'https://nextjs.org/docs/app/guides/authentication',
  'https://nextjs.org/docs/app/getting-started/cache-components',
  'https://nextjs.org/docs/app/guides/package-bundling',
]

const assetPaths = collectAssetPaths(DOCS_DIR)
let completed = 0
const blobOrigin = await discoverBlobOrigin()

console.log(`Discovered asset references: ${assetPaths.length}`)
console.log(`Resolved asset origin: ${blobOrigin}`)

await runWithConcurrency(assetPaths, CONCURRENCY, async (assetPath) => {
  const destination = path.join(PUBLIC_DIR, assetPath)

  if (fs.existsSync(destination)) {
    completed += 1
    return
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })

  const buffer = await downloadAsset(assetPath, blobOrigin)
  fs.writeFileSync(destination, buffer)
  completed += 1
  console.log(`Mirrored ${completed}/${assetPaths.length}: ${assetPath}`)
})

console.log(`Asset mirroring complete: ${assetPaths.length} files`)

function collectAssetPaths(rootDir) {
  const assets = new Set()
  const files = walk(rootDir).filter((file) => file.endsWith('.mdx'))

  const attrPattern =
    /\b(?:src|srcLight|srcDark)=["'](\/(?:docs|learn|videos)\/[^"' )]+\.(?:png|jpg|jpeg|webp|svg|ico|mp4))["']/g
  const markdownPattern =
    /!\[[^\]]*]\((\/(?:docs|learn|videos)\/[^)\s]+\.(?:png|jpg|jpeg|webp|svg|ico|mp4))\)/g

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, ' ')

    for (const match of source.matchAll(attrPattern)) {
      assets.add(match[1])
    }

    for (const match of source.matchAll(markdownPattern)) {
      assets.add(match[1])
    }
  }

  return [...assets].sort()
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(absolute) : absolute
  })
}

async function fetchWithRetry(url, attempts = 3) {
  let lastError

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url)
    } catch (error) {
      lastError = error
      await sleep(400 * (attempt + 1))
    }
  }

  throw lastError
}

async function downloadAsset(assetPath, blobOrigin, attempts = 4) {
  const candidates = [`${BASE_URL}${assetPath}`]

  if (blobOrigin) {
    candidates.push(`${blobOrigin}${assetPath}`)
  }

  let lastError = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate)
        if (!response.ok) {
          lastError = new Error(`Failed ${candidate}: ${response.status} ${response.statusText}`)
          continue
        }

        return Buffer.from(await response.arrayBuffer())
      } catch (error) {
        lastError = error
      }
    }

    await sleep(500 * (attempt + 1))
  }

  throw lastError ?? new Error(`Failed to fetch ${assetPath}`)
}

async function discoverBlobOrigin() {
  for (const pageUrl of DISCOVERY_PAGES) {
    const response = await fetchWithRetry(pageUrl)
    if (!response.ok) {
      continue
    }

    const html = await response.text()
    const match = html.match(/https:\/\/[^"'\\\s]+public\.blob\.vercel-storage\.com/)
    if (match?.[0]) {
      return new URL(match[0]).origin
    }
  }

  return null
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = [...items]

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift()
        if (!next) {
          return
        }

        await worker(next)
      }
    }),
  )
}

function sleep(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}
