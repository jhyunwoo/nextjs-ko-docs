#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'

import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

const ROOT = process.cwd()
const TAG = 'v16.1.6'
const MANIFEST_PATH = path.join(ROOT, 'docs-ko', '_meta', 'manifest.json')
const SOURCE_CACHE_DIR = path.join(ROOT, '.cache', 'source-docs')
const SHARED_DOC_COMMENT_RE =
  /\{\/\*\s*The content of this doc is shared between the app and pages router[\s\S]*?\*\/\}\s*/g
const TRANSLATABLE_ATTRS = new Set(['alt', 'title', 'description', 'summary', 'label', 'caption'])
const OLD_PROTECTED_TERMS = [
  'Next.js',
  'React',
  'React Foundations',
  'Next.js Foundations',
  'React Canary',
  'React Canary releases',
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
  'Firefox',
  'Safari',
  'Chrome',
  'Edge',
  'VSCode',
  'Biome',
  'HTML',
  'CSS',
  'URL',
  'API',
]
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
  const manifestPayload = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'))
  const entries = Array.isArray(manifestPayload) ? manifestPayload : manifestPayload.entries
  const routeToTarget = new Map(entries.map((entry) => [entry.route, entry.targetPath]))
  const filter = process.env.DOCS_KO_FILTER ? new RegExp(process.env.DOCS_KO_FILTER) : null
  const failOnly = process.env.DOCS_KO_ONLY_FAIL === '1'
  let failTargets = null

  if (failOnly) {
    const reportPath = path.join(ROOT, 'reports', 'docs-ko-verification.json')
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    failTargets = new Set(report.rows.filter((row) => row.status === 'FAIL').map((row) => row.file))
  }

  const selectedEntries = entries.filter((entry) => {
    if (failTargets && !failTargets.has(entry.targetPath)) {
      return false
    }

    if (!filter) {
      return true
    }

    return filter.test(entry.sourcePath) || filter.test(entry.targetPath)
  })

  const failures = []
  let repaired = 0

  for (const entry of selectedEntries) {
    const targetFullPath = path.join(ROOT, entry.targetPath)
    const [sourceRaw, targetRaw] = await Promise.all([
      fetchSource(entry),
      readFile(targetFullPath, 'utf8'),
    ])

    const sourceDoc = parseSourceDocument(sourceRaw, entry.targetPath, routeToTarget)
    if (!sourceDoc.ok) {
      failures.push(`${entry.targetPath}: source parse failed: ${sourceDoc.error}`)
      continue
    }

    const targetDoc = parseTargetDocument(
      targetRaw,
      sourceDoc.renderedBody,
      entry.targetPath,
      routeToTarget
    )

    if (!targetDoc.ok) {
      failures.push(`${entry.targetPath}: target parse failed: ${targetDoc.error}`)
      continue
    }

    const mergedTree = structuredClone(sourceDoc.tree)
    mergeNode(mergedTree, targetDoc.tree)

    const body = String(compiler.stringify(mergedTree)).trim()
    const frontmatterBlock = targetDoc.frontmatter
      ? `---\n${targetDoc.frontmatter.trimEnd()}\n---\n\n`
      : sourceDoc.frontmatter
        ? `---\n${sourceDoc.frontmatter.trimEnd()}\n---\n\n`
        : ''

    await writeFile(targetFullPath, `${frontmatterBlock}${body}\n`, 'utf8')
    repaired += 1
  }

  console.log(`Rebuilt ${repaired}/${selectedEntries.length} translated docs.`)

  if (failures.length > 0) {
    console.log(`Failures: ${failures.length}`)
    for (const failure of failures.slice(0, 50)) {
      console.log(`- ${failure}`)
    }

    if (failures.length > 50) {
      console.log(`- ...and ${failures.length - 50} more`)
    }

    process.exitCode = 1
  }
}

function parseSourceDocument(raw, currentTargetPath, routeToTarget) {
  const { frontmatter, body } = splitFrontmatter(raw)
  const cleanedBody = cleanupBody(body)

  try {
    const tree = parser.parse(cleanedBody)
    tree.children = transformChildren(tree.children)
    rewriteLinksInTree(tree, currentTargetPath, routeToTarget)
    const renderedBody = String(compiler.stringify(tree)).trim()
    return { ok: true, frontmatter, tree, renderedBody }
  } catch (error) {
    return {
      ok: false,
      frontmatter,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function parseTargetDocument(raw, sourceRenderedBody, currentTargetPath, routeToTarget) {
  const { frontmatter, body } = splitFrontmatter(raw)
  const cleanedBody = cleanupBody(body)
  const placeholderMap = generateOldPlaceholderMap(sourceRenderedBody)
  const restoredBody = restorePlaceholders(cleanedBody, placeholderMap)
  const attempts = [
    preprocessTargetBody(restoredBody),
    restoredBody,
    preprocessTargetBody(cleanedBody),
    cleanedBody,
  ]

  let lastError = null

  for (const attempt of attempts) {
    try {
      const tree = parser.parse(attempt)
      tree.children = transformChildren(tree.children)
      rewriteLinksInTree(tree, currentTargetPath, routeToTarget)
      return { ok: true, frontmatter, tree }
    } catch (error) {
      lastError = error
    }
  }

  return {
    ok: false,
    frontmatter,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }
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

function preprocessTargetBody(body) {
  return body
    .replace(/([^\n])((?:`{3,}|~{3,})[^\n]*\n)/g, '$1\n\n$2')
    .replace(/((?:\n|^)(?:`{3,}|~{3,}))(?![`~a-zA-Z0-9])([^\n])/g, '$1\n\n$2')
    .replace(/([^\n])(\n> \*\*[^:\n]+:\*\*)/g, '$1\n\n$2')
    .replace(/([^\n])(\n\|[^\n]+\|)/g, '$1\n$2')
    .replace(/^(#{1,6} .+[.?!])([A-Z가-힣])/gm, '$1\n\n$2')
    .replace(/^(#{1,6} .*[가-힣])([A-Z]{2,}|Next\.js|MCP)/gm, '$1\n\n$2')
    .replace(/(?<!`)<(rootDir)>(?!`)/g, '`<$1>`')
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
  return (
    node &&
    (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') &&
    typeof node.value === 'string' &&
    node.value.includes('The content of this doc is shared')
  )
}

function isMdxElement(node, name) {
  return (
    node &&
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
        }
      }
    }
  })
}

function rewriteUrl(url, currentTargetPath, routeToTarget) {
  if (typeof url !== 'string' || !url || /^https?:\/\//i.test(url) || url.startsWith('#')) {
    return url
  }

  if (url.startsWith('docs/')) {
    return `https://nextjs.org/${url}`
  }

  if (!url.startsWith('/')) {
    return url
  }

  const match = url.match(/^([^?#]+)(.*)$/)
  const pathname = match ? match[1] : url
  const suffix = match?.[2] ?? ''

  if (routeToTarget.has(pathname)) {
    const destination = routeToTarget.get(pathname)
    let relative = path.posix.relative(path.posix.dirname(currentTargetPath), destination)
    if (!relative) {
      relative = path.posix.basename(destination)
    }
    return `${relative}${suffix}`
  }

  return `https://nextjs.org${pathname}${suffix}`
}

function generateOldPlaceholderMap(markdown) {
  let working = markdown
  const placeholders = []
  const stash = (value) => {
    const token = `__CODEX_PLACEHOLDER_${placeholders.length}__`
    placeholders.push(value)
    return token
  }

  working = working.replace(/```[\s\S]*?```/g, (match) => stash(match))
  working = working.replace(/~~~[\s\S]*?~~~/g, (match) => stash(match))
  working = working.replace(/`[^`\n]+`/g, (match) => stash(match))
  working = working.replace(/<[^>\n][\s\S]*?\/>/g, (match) => stash(match))
  working = working.replace(/<\/?[A-Za-z][^>]*>/g, (match) => stash(match))
  working = working.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (_, prefix, destination, suffix) => {
    return `${prefix}${stash(destination)}${suffix}`
  })

  const sortedTerms = [...OLD_PROTECTED_TERMS].sort((left, right) => right.length - left.length)
  for (const term of sortedTerms) {
    const escaped = escapeRegExp(term)
    working = working.replace(new RegExp(`\\b${escaped}\\b`, 'g'), () => stash(term))
  }

  return new Map(
    placeholders.map((value, index) => [`__CODEX_PLACEHOLDER_${index}__`, value])
  )
}

function restorePlaceholders(text, placeholderMap) {
  let restored = text
  for (const [token, value] of placeholderMap) {
    restored = restored.split(token).join(value)
  }
  return restored
}

function mergeNode(sourceNode, targetNode) {
  if (!sourceNode || !targetNode || sourceNode.type !== targetNode.type) {
    return
  }

  if (sourceNode.type === 'text') {
    sourceNode.value = targetNode.value
    return
  }

  if (sourceNode.type === 'image' && typeof targetNode.alt === 'string') {
    sourceNode.alt = targetNode.alt
  }

  if (sourceNode.type === 'mdxJsxFlowElement' || sourceNode.type === 'mdxJsxTextElement') {
    if (sourceNode.name === targetNode.name) {
      copyTranslatedAttributes(sourceNode, targetNode)
    }
  }

  if (Array.isArray(sourceNode.children) && Array.isArray(targetNode.children)) {
    sourceNode.children = mergeChildren(sourceNode.children, targetNode.children)
  }
}

function mergeChildren(sourceChildren, targetChildren) {
  const result = []
  let i = 0
  let j = 0

  while (i < sourceChildren.length) {
    if (sourceChildren[i].type === 'text') {
      const sourceTextStart = i
      while (i < sourceChildren.length && sourceChildren[i].type === 'text') {
        i += 1
      }

      const targetTextStart = j
      while (j < targetChildren.length && targetChildren[j].type === 'text') {
        j += 1
      }

      const sourceText = structuredClone(sourceChildren[sourceTextStart])
      const targetTextValue =
        targetTextStart < j
          ? targetChildren.slice(targetTextStart, j).map((node) => node.value).join('')
          : sourceChildren.slice(sourceTextStart, i).map((node) => node.value).join('')

      sourceText.value = targetTextValue
      result.push(sourceText)
      continue
    }

    while (j < targetChildren.length && targetChildren[j].type === 'text') {
      if (result.length > 0 && result[result.length - 1].type === 'text') {
        result[result.length - 1].value += targetChildren[j].value
      }
      j += 1
    }

    const sourceChild = structuredClone(sourceChildren[i])
    const matchIndex = findMatchingChild(targetChildren, j, sourceChild)

    if (matchIndex !== -1) {
      mergeNode(sourceChild, targetChildren[matchIndex])
      j = matchIndex + 1
    }

    result.push(sourceChild)
    i += 1
  }

  while (j < targetChildren.length) {
    if (targetChildren[j].type === 'text' && result.length > 0 && result[result.length - 1].type === 'text') {
      result[result.length - 1].value += targetChildren[j].value
    }
    j += 1
  }

  return compactTextNodes(result)
}

function findMatchingChild(targetChildren, startIndex, sourceChild) {
  for (let index = startIndex; index < Math.min(targetChildren.length, startIndex + 8); index += 1) {
    if (sameSignature(sourceChild, targetChildren[index])) {
      return index
    }
  }

  return -1
}

function sameSignature(left, right) {
  if (!left || !right || left.type !== right.type) {
    return false
  }

  if (left.type === 'heading') {
    return left.depth === right.depth
  }

  if (left.type === 'list') {
    return left.ordered === right.ordered
  }

  if (left.type === 'mdxJsxFlowElement' || left.type === 'mdxJsxTextElement') {
    return left.name === right.name
  }

  return true
}

function copyTranslatedAttributes(sourceNode, targetNode) {
  for (const sourceAttr of sourceNode.attributes ?? []) {
    if (
      sourceAttr.type !== 'mdxJsxAttribute' ||
      !TRANSLATABLE_ATTRS.has(sourceAttr.name) ||
      typeof sourceAttr.value !== 'string'
    ) {
      continue
    }

    const targetAttr = (targetNode.attributes ?? []).find(
      (attr) =>
        attr.type === 'mdxJsxAttribute' &&
        attr.name === sourceAttr.name &&
        typeof attr.value === 'string'
    )

    if (targetAttr) {
      sourceAttr.value = targetAttr.value
    }
  }
}

function compactTextNodes(children) {
  const compacted = []

  for (const child of children) {
    if (
      compacted.length > 0 &&
      compacted[compacted.length - 1].type === 'text' &&
      child.type === 'text'
    ) {
      compacted[compacted.length - 1].value += child.value
      continue
    }

    compacted.push(child)
  }

  return compacted
}

async function fetchSource(entry) {
  const cachePath = path.join(SOURCE_CACHE_DIR, entry.sourcePath)

  if (await exists(cachePath)) {
    return readFile(cachePath, 'utf8')
  }

  const url = entry.rawUrl ?? `https://raw.githubusercontent.com/vercel/next.js/${TAG}/${entry.sourcePath}`
  const content = await curlWithRetry(url)
  await mkdir(path.dirname(cachePath), { recursive: true })
  await writeFile(cachePath, content, 'utf8')
  return content
}

async function curlWithRetry(url) {
  const args = [
    '-L',
    '--fail',
    '--retry',
    '8',
    '--retry-all-errors',
    '--connect-timeout',
    '30',
    '--max-time',
    '120',
    '-A',
    'codex-nextjs-docs-ko-repair/1.0',
    url,
  ]

  return new Promise((resolve, reject) => {
    const child = spawn('curl', args, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
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

      reject(new Error(stderr || `curl exited with ${code}`))
    })
  })
}

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
