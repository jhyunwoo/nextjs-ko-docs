import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { getTargetPathToRouteMap } from '@/lib/docs/content'
import { resolveDocHref } from '@/lib/docs/routes'

const RENDERABLE_ELEMENTS = new Set(['Image', 'Video', 'Check', 'Cross', 'details', 'summary', 'a', 'div', 'br'])

function remarkDocsTransform(currentTargetPath: string) {
  const targetPathToRoute = getTargetPathToRouteMap()

  return function attacher() {
    return (tree: any) => {
      sanitizeTree(tree)

      visit(tree, (node: any) => {
        if (node.type === 'link' && typeof node.url === 'string') {
          node.url = resolveDocHref(currentTargetPath, node.url, targetPathToRoute)
        }

        if (node.type === 'code' && typeof node.meta === 'string' && !/\btitle=/.test(node.meta)) {
          const match = node.meta.match(/\bfilename=(['"])(.*?)\1/)
          if (match?.[2]) {
            node.meta = `${node.meta} title="${match[2]}"`
          }
        }
      })
    }
  }
}

function sanitizeTree(node: any): any {
  if (!node) {
    return node
  }

  if (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    typeof node.name === 'string' &&
    !RENDERABLE_ELEMENTS.has(node.name)
  ) {
    return toLiteralNode(node)
  }

  if (Array.isArray(node.children)) {
    node.children = node.children.map((child: any) => sanitizeTree(child))
  }

  return node
}

function toLiteralNode(node: any) {
  const value = serializeJsx(node)

  if (node.type === 'mdxJsxTextElement') {
    return {
      type: 'inlineCode',
      value,
    }
  }

  return {
    type: 'paragraph',
    children: [
      {
        type: 'inlineCode',
        value,
      },
    ],
  }
}

function serializeJsx(node: any) {
  const attributes = Array.isArray(node.attributes)
    ? node.attributes
        .map((attribute: any) => {
          if (attribute?.type !== 'mdxJsxAttribute') {
            return ''
          }

          if (attribute.value === null) {
            return ` ${attribute.name}`
          }

          if (typeof attribute.value === 'string') {
            return ` ${attribute.name}="${attribute.value}"`
          }

          return ` ${attribute.name}={...}`
        })
        .join('')
    : ''

  if (Array.isArray(node.children) && node.children.length > 0) {
    const text = node.children
      .map((child: any) => (typeof child.value === 'string' ? child.value : ''))
      .join('')

    return `<${node.name}${attributes}>${text}</${node.name}>`
  }

  return `<${node.name}${attributes} />`
}

export function getMdxOptions(currentTargetPath: string) {
  return {
    parseFrontmatter: false,
    mdxOptions: {
      format: 'mdx' as const,
      remarkPlugins: [remarkGfm, remarkDocsTransform(currentTargetPath)],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            properties: {
              className: ['heading-anchor'],
              'aria-label': '섹션 링크',
            },
          },
        ],
        [
          rehypePrettyCode,
          {
            keepBackground: false,
            theme: {
              dark: 'github-dark-default',
              light: 'github-light',
            },
          },
        ],
      ],
    },
  } as const
}
