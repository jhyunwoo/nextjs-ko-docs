#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const TAG = 'v16.1.6'
const MANIFEST_PATH = path.join(ROOT, 'docs-ko', '_meta', 'manifest.json')
const CACHE_PATH = path.join(ROOT, 'docs-ko', '_meta', 'translation-cache.json')
const SHARED_DOC_COMMENT_RE =
  /\{\/\*\s*The content of this doc is shared between the app and pages router[\s\S]*?\*\/\}\s*/g
const TRANSLATABLE_ATTRS = new Set(['alt', 'title', 'description', 'summary', 'label', 'caption'])
const NON_TRANSLATABLE_TERMS = new Set([
  'Next.js',
  'React',
  'Node.js',
  'TypeScript',
  'JavaScript',
  'ESLint',
  'Turbopack',
  'Webpack',
  'Vercel',
  'GitHub',
  'Discord',
  'Reddit',
  'X (Twitter)',
  'X(Twitter)',
  'VSCode',
  'Chrome',
  'Edge',
  'Firefox',
  'Safari',
  'App Router',
  'Pages Router',
  'React Compiler',
  'Module Path Aliases',
  'SWR',
  'ISR',
  'MDX',
  'HTML',
  'CSS',
  'URL',
  'API',
  'CLI',
  'JSON',
  'YAML',
  'ORM',
  'Linux',
  'macOS',
  'Windows',
  'WSL',
])
const PROSE_KEYS = new Set([
  'title',
  'nav_title',
  'description',
  'summary',
  'subtitle',
  'heading',
  'label',
  'caption',
])
const parser = unified().use(remarkParse).use(remarkMdx)
const compiler = unified()
  .use(remarkParse)
  .use(remarkMdx)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
    listItemIndent: 'one',
    emphasis: '*',
    strong: '*',
    incrementListMarker: false,
  })
  .use(remarkMdx)

async function main() {
  await ensureManifest()
  const manifestPayload = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  const allEntries = Array.isArray(manifestPayload) ? manifestPayload : manifestPayload.entries
  const manifest = filterEntries(allEntries)
  const routeToTarget = new Map()

  for (const entry of allEntries) {
    const route = entry.route ?? new URL(entry.sourceUrl).pathname
    routeToTarget.set(route, entry.targetPath)
  }

  const cache = await loadCache()
  const docConcurrency = Math.max(1, Number(process.env.DOCS_KO_DOC_CONCURRENCY ?? 4))
  const skipExisting = process.env.DOCS_KO_SKIP_EXISTING !== '0'
  let processed = 0
  let nextIndex = 0
  let persistQueue = Promise.resolve()

  await Promise.all(
    Array.from({ length: Math.min(docConcurrency, manifest.length) }, async () => {
      while (true) {
        const currentIndex = nextIndex
        nextIndex += 1

        if (currentIndex >= manifest.length) {
          return
        }

        const entry = manifest[currentIndex]
        const targetAbsolutePath = path.join(ROOT, entry.targetPath)

        if (skipExisting && (await exists(targetAbsolutePath))) {
          processed += 1
          if (processed % 10 === 0 || processed === manifest.length) {
            console.log(`translated ${processed}/${manifest.length}: ${entry.targetPath}`)
          }
          continue
        }

        const source = await fetchText(
          entry.rawUrl ?? `https://raw.githubusercontent.com/vercel/next.js/${TAG}/${entry.sourcePath}`
        )
        const translated = await translateDocument({
          source,
          entry,
          routeToTarget,
          cache,
        })

        await mkdir(path.dirname(targetAbsolutePath), { recursive: true })
        await writeFile(targetAbsolutePath, translated, 'utf8')

        processed += 1

        if (processed % 5 === 0 || processed === manifest.length) {
          persistQueue = persistQueue.then(() => persistCache(cache))
          await persistQueue
        }

        if (processed % 10 === 0 || processed === manifest.length) {
          console.log(`translated ${processed}/${manifest.length}: ${entry.targetPath}`)
        }
      }
    })
  )

  await persistQueue
  await persistCache(cache)
}

function filterEntries(entries) {
  let filtered = [...entries]
  const filter = process.env.DOCS_KO_FILTER
  const limit = Number(process.env.DOCS_KO_LIMIT ?? 0)

  if (filter) {
    const matcher = new RegExp(filter)
    filtered = filtered.filter((entry) => matcher.test(entry.sourcePath) || matcher.test(entry.targetPath))
  }

  if (limit > 0) {
    filtered = filtered.slice(0, limit)
  }

  return filtered
}

async function translateDocument({ source, entry, routeToTarget, cache }) {
  const { frontmatter, body } = splitFrontmatter(source)
  const translatedFrontmatter = frontmatter ? await translateFrontmatter(frontmatter, cache) : null
  const cleanedBody = cleanupBody(body)
  const tree = parser.parse(cleanedBody)

  tree.children = transformChildren(tree.children)
  rewriteLinksInTree(tree, entry.targetPath, routeToTarget)

  const segments = collectTranslatableSegments(tree)
  await translateSegments(
    segments.map((segment) => segment.key),
    cache,
    { assumeTranslatable: true }
  )
  applySegmentTranslations(segments, cache)

  const renderedBody = String(compiler.stringify(tree)).trim()
  const frontmatterBlock = translatedFrontmatter
    ? `---\n${translatedFrontmatter.trimEnd()}\n---\n\n`
    : ''

  return `${frontmatterBlock}${renderedBody}\n`
}

function splitFrontmatter(source) {
  if (!source.startsWith('---\n')) {
    return { frontmatter: null, body: source }
  }

  const endIndex = source.indexOf('\n---\n', 4)

  if (endIndex === -1) {
    return { frontmatter: null, body: source }
  }

  return {
    frontmatter: source.slice(4, endIndex),
    body: source.slice(endIndex + 5),
  }
}

function cleanupBody(body) {
  return body.replace(SHARED_DOC_COMMENT_RE, '').trimStart()
}

async function translateFrontmatter(frontmatter, cache) {
  const parsed = YAML.parse(frontmatter)
  const pending = []

  const walk = (value, keyPath = []) => {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, keyPath))
    }

    if (value && typeof value === 'object') {
      const next = {}
      for (const [key, innerValue] of Object.entries(value)) {
        next[key] = walk(innerValue, [...keyPath, key])
      }
      return next
    }

    if (shouldTranslateYamlString(value, keyPath.at(-1) ?? '')) {
      pending.push(value)
    }

    return value
  }

  walk(parsed)
  await translateSegments(pending, cache, { forceSingle: true, assumeTranslatable: true })

  const translated = (value, keyPath = []) => {
    if (Array.isArray(value)) {
      return value.map((item) => translated(item, keyPath))
    }

    if (value && typeof value === 'object') {
      const next = {}
      for (const [key, innerValue] of Object.entries(value)) {
        next[key] = translated(innerValue, [...keyPath, key])
      }
      return next
    }

    if (shouldTranslateYamlString(value, keyPath.at(-1) ?? '')) {
      return cache[value] ?? value
    }

    return value
  }

  return YAML.stringify(translated(parsed))
}

function shouldTranslateYamlString(value, key) {
  if (typeof value !== 'string') {
    return false
  }

  if (!/[A-Za-z]/.test(value)) {
    return false
  }

  if (PROSE_KEYS.has(key)) {
    return true
  }

  if (looksLikeRoute(value) || looksLikeUrl(value) || looksLikeIdentifier(value)) {
    return false
  }

  return /^[A-Z]/.test(value) || /\s/.test(value)
}

function transformChildren(children = []) {
  const transformed = []

  for (const child of children) {
    if (isSharedCommentNode(child)) {
      continue
    }

    if (isMdxElement(child, 'PagesOnly')) {
      continue
    }

    if (isMdxElement(child, 'AppOnly')) {
      transformed.push(...transformChildren(child.children ?? []))
      continue
    }

    if (Array.isArray(child.children)) {
      child.children = transformChildren(child.children)
    }

    transformed.push(child)
  }

  return transformed
}

function isSharedCommentNode(node) {
  if (!node) {
    return false
  }

  if (node.type !== 'mdxFlowExpression' && node.type !== 'mdxTextExpression') {
    return false
  }

  return typeof node.value === 'string' && node.value.includes('The content of this doc is shared')
}

function isMdxElement(node, name) {
  if (!node) {
    return false
  }

  return (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    node.name === name
  )
}

function rewriteLinksInTree(tree, currentTargetPath, routeToTarget) {
  visit(tree, (node) => {
    if (node.type === 'link' || node.type === 'definition' || node.type === 'image') {
      node.url = rewriteUrl(node.url, currentTargetPath, routeToTarget)
    }

    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      for (const attr of node.attributes ?? []) {
        if (attr.type !== 'mdxJsxAttribute' || typeof attr.value !== 'string') {
          continue
        }

        if (attr.name === 'href') {
          attr.value = rewriteUrl(attr.value, currentTargetPath, routeToTarget)
          continue
        }

        if (TRANSLATABLE_ATTRS.has(attr.name) && shouldTranslateText(attr.value)) {
          attr.__translateKey = attr.value
        }
      }
    }

    if (node.type === 'image' && typeof node.alt === 'string' && shouldTranslateText(node.alt)) {
      node.__translateAltKey = node.alt
    }
  })
}

function collectTranslatableSegments(tree) {
  const segments = []

  visit(tree, (node) => {
    if (node.type === 'text') {
      const segment = toTextSegment(node.value)
      if (segment) {
        segments.push({
          type: 'text',
          node,
          ...segment,
        })
      }
      return
    }

    if (node.type === 'image' && typeof node.__translateAltKey === 'string') {
      segments.push({
        type: 'image-alt',
        node,
        key: node.__translateAltKey,
      })
      return
    }

    if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
      for (const attr of node.attributes ?? []) {
        if (
          attr.type === 'mdxJsxAttribute' &&
          typeof attr.value === 'string' &&
          typeof attr.__translateKey === 'string'
        ) {
          segments.push({
            type: 'attribute',
            attr,
            key: attr.__translateKey,
          })
        }
      }
    }
  })

  return segments
}

function toTextSegment(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) {
    return null
  }

  const [, leading, core, trailing] = match

  if (!shouldTranslateText(core)) {
    return null
  }

  return {
    leading,
    trailing,
    key: core,
  }
}

function applySegmentTranslations(segments, cache) {
  for (const segment of segments) {
    const translated = cache[segment.key] ?? segment.key

    if (segment.type === 'text') {
      segment.node.value = `${segment.leading}${translated}${segment.trailing}`
      continue
    }

    if (segment.type === 'attribute') {
      segment.attr.value = translated
      continue
    }

    if (segment.type === 'image-alt') {
      segment.node.alt = translated
    }
  }
}

function shouldTranslateText(value) {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return false
  }

  if (!/[A-Za-z]/.test(trimmed)) {
    return false
  }

  if (NON_TRANSLATABLE_TERMS.has(trimmed)) {
    return false
  }

  if (looksLikeUrl(trimmed) || looksLikeIdentifier(trimmed) || looksLikeRoute(trimmed)) {
    return false
  }

  return true
}

function looksLikeUrl(value) {
  return /^(https?:\/\/|mailto:|tel:)/.test(value)
}

function looksLikeRoute(value) {
  return value.startsWith('/') || /^docs\//.test(value) || /^[a-z0-9-]+(?:\/[a-z0-9-]+)+$/i.test(value)
}

function looksLikeIdentifier(value) {
  if (/[\/@]/.test(value)) {
    return true
  }

  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/.test(value)) {
    return true
  }

  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(value)) {
    return true
  }

  if (/^[A-Z0-9_]+$/.test(value) && /_/.test(value)) {
    return true
  }

  if (/^[a-z][A-Za-z0-9]*\(\)$/.test(value)) {
    return true
  }

  return false
}

function rewriteUrl(url, currentTargetPath, routeToTarget) {
  if (typeof url !== 'string' || !url) {
    return url
  }

  if (url.startsWith('#') || looksLikeUrl(url)) {
    return url
  }

  if (url.startsWith('docs/')) {
    return `https://nextjs.org/${url}`
  }

  if (!url.startsWith('/')) {
    return url
  }

  const { pathname, suffix } = splitUrl(url)

  if (routeToTarget.has(pathname)) {
    const destination = routeToTarget.get(pathname)
    let relative = path.relative(path.dirname(currentTargetPath), destination).replaceAll('\\', '/')

    if (!relative) {
      relative = path.basename(destination)
    }

    return `${relative}${suffix}`
  }

  return `https://nextjs.org${pathname}${suffix}`
}

function splitUrl(url) {
  const match = url.match(/^([^?#]+)(.*)$/)

  if (!match) {
    return { pathname: url, suffix: '' }
  }

  return { pathname: match[1], suffix: match[2] ?? '' }
}

async function translateSegments(values, cache, options = {}) {
  const unique = [...new Set(values)].filter((value) => {
    if (cache[value]) {
      return false
    }

    if (options.assumeTranslatable) {
      return true
    }

    return shouldTranslateText(value)
  })

  if (unique.length === 0) {
    return
  }

  const batchSize = options.forceSingle ? 1 : 20
  const batches = []
  for (let index = 0; index < unique.length; index += batchSize) {
    batches.push(unique.slice(index, index + batchSize))
  }

  const concurrency = options.forceSingle ? 1 : 3
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
      while (nextIndex < batches.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        const batch = batches[currentIndex]
        const translatedBatch = await translateBatch(batch)

        for (const [original, translated] of translatedBatch) {
          cache[original] = translated
        }
      }
    })
  )
}

async function translateBatch(values, attempt = 0) {
  if (values.length === 1) {
    return new Map([[values[0], await translateText(values[0], attempt)]])
  }

  const tokens = values.map((_, index) => ({
    start: `ZXQSEG${index}ZXQ`,
    end: `ZXQEND${index}ZXQ`,
  }))
  const payload = values
    .map((value, index) => `${tokens[index].start}\n${protectTerms(value)}\n${tokens[index].end}`)
    .join('\n\n')

  try {
    const translatedPayload = await translateTextDirect(payload)
    const translated = new Map()

    for (let index = 0; index < values.length; index += 1) {
      const pattern = new RegExp(`${tokens[index].start}\\s*([\\s\\S]*?)\\s*${tokens[index].end}`)
      const match = translatedPayload.match(pattern)

      if (!match) {
        throw new Error(`batch token ${index} was not preserved`)
      }

      translated.set(values[index], restoreProtectedTerms(normalizeTranslatedText(match[1].trim())))
    }

    return translated
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('HTTP Error 429') && attempt < 4) {
      await sleep(30000 * (attempt + 1))
      return translateBatch(values, attempt + 1)
    }

    if ((message.includes('HTTP Error 400') || message.includes('batch token')) && values.length > 1) {
      const midpoint = Math.ceil(values.length / 2)
      const left = await translateBatch(values.slice(0, midpoint), attempt)
      const right = await translateBatch(values.slice(midpoint), attempt)
      return new Map([...left, ...right])
    }

    const fallback = new Map()
    for (const value of values) {
      fallback.set(value, await translateText(value, attempt))
    }
    return fallback
  }
}

async function translateText(text, attempt = 0) {
  const protectedText = protectTerms(text)

  try {
    const translated = await translateTextDirect(protectedText)
    return restoreProtectedTerms(normalizeTranslatedText(translated))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (message.includes('HTTP Error 429') && attempt < 4) {
      await sleep(30000 * (attempt + 1))
      return translateText(text, attempt + 1)
    }

    if (message.includes('HTTP Error 400') && text.length > 600) {
      const [left, right] = splitTranslationInput(text)
      return `${await translateText(left, attempt)}${await translateText(right, attempt)}`
    }

    throw error
  }
}

function protectTerms(text) {
  let protectedText = text
  const sortedTerms = [...NON_TRANSLATABLE_TERMS].sort((left, right) => right.length - left.length)

  for (const term of sortedTerms) {
    const escaped = escapeRegExp(term)
    protectedText = protectedText.replace(new RegExp(`\\b${escaped}\\b`, 'g'), `ZXQTERM_${term}_ZXQ`)
  }

  return protectedText
}

function restoreProtectedTerms(text) {
  return text.replace(/ZXQTERM_([^_]+(?:_[^_]+)*)_ZXQ/g, (_, rawTerm) => rawTerm.replaceAll('_', ' '))
}

function normalizeTranslatedText(text) {
  return text
    .replace(/([A-Za-z0-9.+#/-]+)은/g, '$1는')
    .replace(/([A-Za-z0-9.+#/-]+)이/g, '$1가')
    .replace(/([A-Za-z0-9.+#/-]+)을/g, '$1를')
    .replace(/([A-Za-z0-9.+#/-]+)과/g, '$1와')
    .replace(/\bApp Router가\b/g, 'App Router는')
    .replace(/\bPages Router가\b/g, 'Pages Router는')
}

async function translateTextDirect(text) {
  const python = [
    'import json',
    'import sys',
    'import time',
    'import urllib.parse',
    'import urllib.request',
    '',
    'text = sys.stdin.read()',
    "base = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q='",
    'last_error = None',
    'for attempt in range(8):',
    '    try:',
    '        url = base + urllib.parse.quote(text)',
    "        req = urllib.request.Request(url, headers={'User-Agent': 'codex-nextjs-docs-ko/2.0'})",
    '        with urllib.request.urlopen(req, timeout=30) as response:',
    '            payload = json.load(response)',
    "        print(''.join(item[0] for item in payload[0]), end='')",
    '        sys.exit(0)',
    '    except Exception as exc:',
    '        last_error = exc',
    '        time.sleep(1.5 * (attempt + 1))',
    "raise SystemExit(f'translation failed: {last_error}')",
  ].join('\n')

  return runPythonTranslation(python, text)
}

async function ensureManifest() {
  if (await exists(MANIFEST_PATH)) {
    return
  }

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'build-manifest.mjs')], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`build-manifest exited with ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, {
    headers: {
      'user-agent': 'codex-nextjs-docs-ko/2.0',
    },
  })

  if (!response.ok) {
    throw new Error(`fetch failed for ${url}: ${response.status}`)
  }

  return response.text()
}

async function fetchWithRetry(url, init, attempts = 8) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      lastError = error
      if (attempt === attempts) {
        break
      }

      await sleep(1500 * attempt)
    }
  }

  throw lastError
}

async function loadCache() {
  if (!(await exists(CACHE_PATH))) {
    return {}
  }

  return JSON.parse(await readFile(CACHE_PATH, 'utf8'))
}

async function persistCache(cache) {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8')
}

async function exists(targetPath) {
  try {
    await stat(targetPath)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function splitTranslationInput(text) {
  const midpoint = Math.floor(text.length / 2)
  const candidates = [
    text.lastIndexOf('\n\n', midpoint),
    text.lastIndexOf('\n', midpoint),
    text.lastIndexOf('. ', midpoint),
    text.lastIndexOf(' ', midpoint),
  ].filter((index) => index > 0)

  const splitPoint = candidates.length > 0 ? Math.max(...candidates) : midpoint
  return [text.slice(0, splitPoint), text.slice(splitPoint)]
}

function runPythonTranslation(script, input) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', ['-c', script], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(stderr || `python translator exited with code ${code}`))
    })

    child.stdin.end(input)
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
