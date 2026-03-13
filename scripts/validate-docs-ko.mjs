#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'

const ROOT = process.cwd()
const DOCS_KO_DIR = path.join(ROOT, 'docs-ko')
const MANIFEST_PATH = path.join(DOCS_KO_DIR, '_meta', 'manifest.json')
const RAW_BASE_URL = 'https://raw.githubusercontent.com/vercel/next.js/v16.1.6/'
const SHARED_COMMENT_MARKERS = [
  'The content of this doc is shared between the app and pages router',
  'You can use the `<PagesOnly>Content</PagesOnly>` component',
]
const ALLOWED_ENGLISH_PATTERNS = [
  /\bNext\.js\b/g,
  /\bReact\b/g,
  /\bNode\.js\b/g,
  /\bApp Router\b/g,
  /\bPages Router\b/g,
  /\bTurbopack\b/g,
  /\bWebpack\b/g,
  /\bJavaScript\b/g,
  /\bTypeScript\b/g,
  /\bESLint\b/g,
  /\bVercel\b/g,
  /\bGitHub\b/g,
  /\bOpenTelemetry\b/g,
  /\bChrome\b/g,
  /\bFirefox\b/g,
  /\bSafari\b/g,
  /\bEdge\b/g,
  /\bmacOS\b/g,
  /\bWindows\b/g,
  /\bLinux\b/g,
  /\bHTML\b/g,
  /\bCSS\b/g,
  /\bAPI\b/g,
  /\bURL\b/g,
  /\bSEO\b/g,
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

const failures = []
const warnings = []

async function main() {
  const manifest = await loadManifest()
  const entries = Array.isArray(manifest) ? manifest : manifest.entries

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Manifest is empty or malformed.')
  }

  const expectedTargets = new Set(entries.map((entry) => normalizeRelative(entry.targetPath)))
  const actualTargets = await collectTranslatedFiles()

  compareFileSets(entries, expectedTargets, actualTargets)
  await validateEntries(entries)

  printSummary(entries.length, actualTargets.size)

  if (failures.length > 0) {
    process.exitCode = 1
  }
}

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Manifest not found at ${MANIFEST_PATH}`)
    }
    throw error
  }
}

async function collectTranslatedFiles() {
  const results = []
  await walkDir(DOCS_KO_DIR, results)
  return new Set(
    results
      .filter((file) => file.endsWith('.mdx'))
      .filter((file) => !file.startsWith('_meta/'))
      .map((file) => normalizeRelative(path.posix.join('docs-ko', file))),
  )
}

async function walkDir(dir, results, prefix = '') {
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return
    }
    throw error
  }

  for (const entry of entries) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDir(fullPath, results, nextPrefix)
    } else {
      results.push(nextPrefix)
    }
  }
}

function compareFileSets(entries, expectedTargets, actualTargets) {
  if (expectedTargets.size !== entries.length) {
    fail(
      '_meta/manifest.json',
      `Manifest targetPath count mismatch: expected ${entries.length}, found ${expectedTargets.size} unique target paths.`,
    )
  }

  if (actualTargets.size !== expectedTargets.size) {
    fail(
      'docs-ko',
      `Translated file count mismatch: manifest expects ${expectedTargets.size}, found ${actualTargets.size}.`,
    )
  }

  for (const targetPath of expectedTargets) {
    if (!actualTargets.has(targetPath)) {
      fail(targetPath, 'Target file listed in manifest is missing.')
    }
  }

  for (const actualPath of actualTargets) {
    if (!expectedTargets.has(actualPath)) {
      fail(actualPath, 'Extra translated MDX file exists outside the manifest.')
    }
  }
}

async function validateEntries(entries) {
  const concurrency = 6
  let index = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
      while (index < entries.length) {
        const current = entries[index]
        index += 1
        await validateEntry(current)
      }
    }),
  )
}

async function validateEntry(entry) {
  const targetPath = normalizeRelative(entry.targetPath)
  const targetFullPath = path.join(ROOT, targetPath)

  try {
    await access(targetFullPath)
  } catch {
    return
  }

  const [targetRaw, sourceRaw] = await Promise.all([
    readFile(targetFullPath, 'utf8'),
    fetchSource(entry),
  ])
  let normalizedSource = sourceRaw
  let normalizedTarget = targetRaw

  try {
    normalizedSource = normalizeForValidation(sourceRaw)
  } catch (error) {
    fail(targetPath, `Unable to normalize source MDX for validation: ${formatError(error)}`)
  }

  try {
    normalizedTarget = normalizeForValidation(targetRaw)
  } catch (error) {
    fail(targetPath, `Unable to normalize target MDX for validation: ${formatError(error)}`)
  }

  validateFrontmatter(entry, sourceRaw, targetRaw)
  validateWrapperCleanup(targetPath, targetRaw)
  validateLinks(targetPath, normalizedTarget)
  validateCodeIntegrity(targetPath, normalizedSource, normalizedTarget)
  validateEnglishResidue(targetPath, targetRaw)
}

async function fetchSource(entry) {
  const sourceUrl =
    typeof entry.sourceRawUrl === 'string'
      ? entry.sourceRawUrl
      : typeof entry.sourceUrl === 'string' && entry.sourceUrl.includes('raw.githubusercontent.com')
        ? entry.sourceUrl
        : `${RAW_BASE_URL}${entry.sourcePath}`

  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch source ${sourceUrl}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

function validateFrontmatter(entry, sourceRaw, targetRaw) {
  const sourceFrontmatter = extractFrontmatter(sourceRaw)
  const targetFrontmatter = extractFrontmatter(targetRaw)
  const sourceKeys = sortSet(collectFrontmatterKeys(sourceFrontmatter))
  const targetKeys = sortSet(collectFrontmatterKeys(targetFrontmatter))

  if (sourceKeys.join('\n') !== targetKeys.join('\n')) {
    fail(
      normalizeRelative(entry.targetPath),
      `Frontmatter keys differ from source.\nsource: ${sourceKeys.join(', ')}\ntarget: ${targetKeys.join(', ')}`,
    )
  }
}

function validateWrapperCleanup(targetPath, targetRaw) {
  let tree

  try {
    tree = parser.parse(stripFrontmatter(targetRaw))
  } catch (error) {
    fail(targetPath, `Unable to parse target MDX for wrapper validation: ${formatError(error)}`)
    return
  }

  let hasPagesOnly = false
  let hasAppOnly = false

  visit(tree, (node) => {
    if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') {
      return
    }

    if (node.name === 'PagesOnly') {
      hasPagesOnly = true
    }

    if (node.name === 'AppOnly') {
      hasAppOnly = true
    }
  })

  if (hasPagesOnly) {
    fail(targetPath, 'Found leftover <PagesOnly> wrapper.')
  }

  if (hasAppOnly) {
    fail(targetPath, 'Found leftover <AppOnly> wrapper.')
  }

  for (const marker of SHARED_COMMENT_MARKERS) {
    if (targetRaw.includes(marker)) {
      fail(targetPath, 'Found shared-router JSX comment that should have been removed.')
      break
    }
  }
}

function validateLinks(targetPath, targetRaw) {
  const body = removeCodeFences(stripFrontmatter(targetRaw))
  const links = collectLinks(body)

  for (const link of links) {
    if (!link) {
      continue
    }

    if (/^https?:\/\//i.test(link) || /^mailto:/i.test(link) || /^tel:/i.test(link) || /^data:/i.test(link)) {
      continue
    }

    if (link.startsWith('#')) {
      continue
    }

    if (link.startsWith('/docs/pages') || link.startsWith('/docs/app') || link.startsWith('/docs/architecture') || link.startsWith('/docs/community') || link === '/docs') {
      fail(targetPath, `Found untranslated site-local docs link: ${link}`)
      continue
    }

    if (link.startsWith('/docs')) {
      fail(targetPath, `Found unresolved local docs link: ${link}`)
      continue
    }

    if (isRelativeLink(link) || link.startsWith('/docs-ko/')) {
      const resolved = resolveLocalLink(targetPath, link)
      if (!resolved) {
        fail(targetPath, `Broken local translated docs link: ${link}`)
      }
    }
  }
}

function validateCodeIntegrity(targetPath, sourceRaw, targetRaw) {
  const sourceCodeBlocks = extractCodeFences(sourceRaw)
  const targetCodeBlocks = extractCodeFences(targetRaw)

  if (!sameArray(sourceCodeBlocks, targetCodeBlocks)) {
    fail(targetPath, 'Code fences changed between source and target.')
  }

  const sourceInlineCode = extractInlineCode(sourceRaw)
  const targetInlineCode = extractInlineCode(targetRaw)

  if (!sameArray(sourceInlineCode, targetInlineCode)) {
    fail(targetPath, 'Inline code changed between source and target.')
  }
}

function validateEnglishResidue(targetPath, targetRaw) {
  const prose = extractProseForResidueCheck(targetRaw)
  const lines = prose
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const residue = []

  for (const line of lines) {
    if (looksCodeLike(line) || looksMostlyNonProse(line)) {
      continue
    }

    let candidate = ` ${line} `
    for (const pattern of ALLOWED_ENGLISH_PATTERNS) {
      candidate = candidate.replace(pattern, ' ')
    }

    candidate = candidate
      .replace(/\b[A-Z][A-Za-z0-9./_-]*\b/g, ' ')
      .replace(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g, ' ')
      .replace(/\b[a-z]+(?:\.[a-z0-9]+)+\b/g, ' ')
      .replace(/\b[a-z0-9_-]+\/[a-z0-9_./-]+\b/gi, ' ')
      .replace(/\b[a-z0-9_-]+\.(?:js|jsx|ts|tsx|md|mdx|json|css|scss|svg|png|jpg|jpeg|gif|ico|woff2?)\b/gi, ' ')
      .replace(/\b[A-Z]{2,}\b/g, ' ')

    const matches = candidate.match(/\b[A-Za-z]{3,}(?:\s+[A-Za-z]{3,})+\b/g) ?? []
    for (const match of matches) {
      residue.push(match.trim())
    }
  }

  if (residue.length > 0) {
    warn(targetPath, `Potential English residue detected: ${Array.from(new Set(residue)).slice(0, 5).join(', ')}`)
  }
}

function extractFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return match ? match[1] : ''
}

function stripFrontmatter(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
}

function collectFrontmatterKeys(frontmatter) {
  const keys = new Set()
  const stack = []
  const lines = frontmatter.split(/\r?\n/)

  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) {
      continue
    }

    const keyMatch = line.match(/^(\s*)([A-Za-z0-9_]+):(?:\s|$)/)
    if (!keyMatch) {
      continue
    }

    const [, indentRaw, key] = keyMatch
    const indent = indentRaw.length

    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const pathParts = [...stack.map((item) => item.key), key]
    keys.add(pathParts.join('.'))
    stack.push({ indent, key })
  }

  return keys
}

function collectLinks(body) {
  const scanBody = body.replace(/`[^`\n]+`/g, ' ')
  const links = []
  const markdownLinkRegex = /\[[^\]]*]\(([^)\s]+(?:\s+"[^"]*")?)\)/g
  const jsxHrefRegex = /\bhref=["']([^"']+)["']/g

  for (const match of scanBody.matchAll(markdownLinkRegex)) {
    const rawTarget = match[1].trim()
    const target = rawTarget.split(/\s+"/, 1)[0]
    links.push(target)
  }

  for (const match of scanBody.matchAll(jsxHrefRegex)) {
    links.push(match[1].trim())
  }

  return links
}

function resolveLocalLink(targetPath, link) {
  const linkWithoutHash = link.split('#', 1)[0].split('?', 1)[0]
  if (!linkWithoutHash) {
    return true
  }

  let candidateBase
  if (linkWithoutHash.startsWith('/docs-ko/')) {
    candidateBase = normalizeRelative(linkWithoutHash.slice(1))
  } else {
    const sourceDir = path.posix.dirname(normalizeRelative(targetPath))
    candidateBase = normalizeRelative(path.posix.join(sourceDir, linkWithoutHash))
  }

  const candidates = [
    candidateBase,
    `${candidateBase}.mdx`,
    path.posix.join(candidateBase, 'index.mdx'),
  ]

  return candidates.some((candidate) => existsSync(path.join(ROOT, candidate)))
}

function extractCodeFences(raw) {
  const fences = []
  const lines = raw.split(/\r?\n/)
  let inFence = false
  let marker = ''
  let buffer = []

  for (const line of lines) {
    const opener = line.match(/^(```+|~~~+)/)
    if (!inFence && opener) {
      inFence = true
      marker = opener[1]
      buffer = [line]
      continue
    }

    if (inFence) {
      buffer.push(line)
      if (line.startsWith(marker)) {
        fences.push(buffer.join('\n').trimEnd())
        inFence = false
        marker = ''
        buffer = []
      }
    }
  }

  return fences
}

function extractInlineCode(raw) {
  const body = stripFrontmatter(raw)
  const withoutFences = removeCodeFences(body)
  const matches = []

  for (const match of withoutFences.matchAll(/`([^`\n]+)`/g)) {
    matches.push(match[1])
  }

  return matches
}

function removeCodeFences(raw) {
  const lines = raw.split(/\r?\n/)
  const output = []
  let inFence = false
  let marker = ''

  for (const line of lines) {
    const opener = line.match(/^(```+|~~~+)/)
    if (!inFence && opener) {
      inFence = true
      marker = opener[1]
      continue
    }

    if (inFence) {
      if (line.startsWith(marker)) {
        inFence = false
        marker = ''
      }
      continue
    }

    output.push(line)
  }

  return output.join('\n')
}

function extractProseForResidueCheck(raw) {
  let body = stripFrontmatter(raw)
  body = removeCodeFences(body)
  body = body.replace(/`[^`\n]+`/g, ' ')
  body = body.replace(/\{\/\*[\s\S]*?\*\/}/g, ' ')
  body = body.replace(/<[^>]+>/g, ' ')
  body = body.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
  body = body.replace(/\[([^\]]*)]\([^)]*\)/g, ' $1 ')
  body = body.replace(/https?:\/\/\S+/g, ' ')
  return body
}

function looksCodeLike(line) {
  return (
    /[{}[\]<>]/.test(line) ||
    /\bimport\b|\bexport\b|=>|::|\/\w|^\||^[-*]\s*`/.test(line) ||
    /`[^`]+`/.test(line)
  )
}

function looksMostlyNonProse(line) {
  const alpha = (line.match(/[A-Za-z가-힣]/g) ?? []).length
  const nonAlpha = line.length - alpha
  return alpha === 0 || nonAlpha > alpha * 1.5
}

function isRelativeLink(link) {
  return (
    !link.startsWith('/') &&
    !/^[a-z]+:/i.test(link) &&
    !link.startsWith('#')
  )
}

function normalizeRelative(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\/+/, '')
}

function sameArray(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

function sortSet(values) {
  return Array.from(values).sort((left, right) => left.localeCompare(right))
}

function fail(file, message) {
  failures.push({ file, message })
}

function warn(file, message) {
  warnings.push({ file, message })
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function printSummary(expectedCount, actualCount) {
  console.log(`Validated manifest: ${MANIFEST_PATH}`)
  console.log(`Expected translated docs: ${expectedCount}`)
  console.log(`Found translated docs: ${actualCount}`)

  if (failures.length === 0) {
    console.log('Result: PASS')
  } else {
    console.log(`Result: FAIL (${failures.length} issues)`)
    for (const issue of failures) {
      console.log(`- [FAIL] ${issue.file}: ${issue.message}`)
    }
  }

  if (warnings.length > 0) {
    console.log(`Warnings: ${warnings.length}`)
    for (const issue of warnings) {
      console.log(`- [WARN] ${issue.file}: ${issue.message}`)
    }
  }
}

function normalizeForValidation(raw) {
  const { frontmatter, body } = splitFrontmatter(raw)
  const tree = parser.parse(body)
  tree.children = transformChildren(tree.children)
  const renderedBody = String(compiler.stringify(tree)).trim()
  return frontmatter ? `---\n${frontmatter.trimEnd()}\n---\n\n${renderedBody}\n` : `${renderedBody}\n`
}

function splitFrontmatter(raw) {
  if (!raw.startsWith('---\n')) {
    return { frontmatter: null, body: raw }
  }

  const endIndex = raw.indexOf('\n---\n', 4)
  if (endIndex === -1) {
    return { frontmatter: null, body: raw }
  }

  return {
    frontmatter: raw.slice(4, endIndex),
    body: raw.slice(endIndex + 5),
  }
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

main().catch((error) => {
  console.error(`Validation failed: ${error.message}`)
  process.exitCode = 1
})
