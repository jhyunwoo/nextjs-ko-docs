import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocPage } from '@/components/doc-page'
import { getRootDoc } from '@/lib/docs/content'
import { buildHomeMetadata } from '@/lib/seo'

export const dynamic = 'force-static'

export function generateMetadata(): Metadata {
  const doc = getRootDoc()

  return buildHomeMetadata(doc?.frontmatter.description)
}

export default function HomePage() {
  const doc = getRootDoc()

  if (!doc) {
    notFound()
  }

  return <DocPage doc={doc} />
}
