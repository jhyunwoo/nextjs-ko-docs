import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DocPage } from '@/components/doc-page'
import { getDocWithContext, getStaticSlugs } from '@/lib/docs/content'
import { buildDocMetadata } from '@/lib/seo'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getStaticSlugs()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const route = `/${slug.join('/')}`
  const doc = getDocWithContext(route)

  if (!doc) {
    return {}
  }

  return buildDocMetadata(doc)
}

export default async function DocRoutePage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const route = `/${slug.join('/')}`
  const doc = getDocWithContext(route)

  if (!doc) {
    notFound()
  }

  return <DocPage doc={doc} />
}
