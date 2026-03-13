import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { DocRecord } from '@/lib/docs/types'

interface DocPaginationProps {
  prev?: Pick<DocRecord, 'route' | 'frontmatter'>
  next?: Pick<DocRecord, 'route' | 'frontmatter'>
}

export function DocPagination({ prev, next }: DocPaginationProps) {
  if (!prev && !next) {
    return null
  }

  return (
    <nav className="doc-pagination" aria-label="문서 이동">
      {prev ? (
        <Link href={prev.route} className="pagination-card">
          <ArrowLeft size={16} />
          <div>
            <span>이전 문서</span>
            <strong>{prev.frontmatter.title}</strong>
          </div>
        </Link>
      ) : (
        <div />
      )}

      {next ? (
        <Link href={next.route} className="pagination-card next">
          <div>
            <span>다음 문서</span>
            <strong>{next.frontmatter.title}</strong>
          </div>
          <ArrowRight size={16} />
        </Link>
      ) : null}
    </nav>
  )
}
