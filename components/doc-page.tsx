import { compileMDX } from 'next-mdx-remote/rsc'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { DocPagination } from '@/components/doc-pagination'
import { DocsShell } from '@/components/docs-shell'
import { getMdxComponents } from '@/components/mdx-components'
import { RelatedLinks } from '@/components/related-links'
import { getBreadcrumbs, getNavigationTree } from '@/lib/docs/content'
import { getMdxOptions } from '@/lib/docs/mdx'
import { buildBreadcrumbJsonLd, buildDocJsonLd, stringifyJsonLd } from '@/lib/seo'
import type { DocRecord } from '@/lib/docs/types'

interface DocPageProps {
  doc: DocRecord
}

export async function DocPage({ doc }: DocPageProps) {
  const navigation = getNavigationTree()
  const breadcrumbs = getBreadcrumbs(doc.route)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbs)
  const docJsonLd = buildDocJsonLd(doc)
  const { content } = await compileMDX({
    source: doc.body,
    components: getMdxComponents(),
    options: getMdxOptions(doc.targetPath) as any,
  })

  return (
    <DocsShell navigation={navigation} currentRoute={doc.route} headings={doc.headings}>
      <article className="doc-article">
        {docJsonLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(docJsonLd) }} />
        ) : null}
        {breadcrumbJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: stringifyJsonLd(breadcrumbJsonLd) }}
          />
        ) : null}
        <Breadcrumbs items={breadcrumbs} />

        <header className="doc-header">
          <div className="doc-header-meta">
            {doc.frontmatter.version ? <span className="version-badge">{doc.frontmatter.version}</span> : null}
            <span className="section-label">{doc.section === 'app' ? 'App Router' : doc.section}</span>
          </div>
          <h1>{doc.frontmatter.title}</h1>
          <p>{doc.frontmatter.description}</p>
        </header>

        <div className="doc-body">{content}</div>

        <RelatedLinks frontmatter={doc.frontmatter} items={doc.relatedItems} />
        <DocPagination prev={doc.prev} next={doc.next} />
      </article>
    </DocsShell>
  )
}
