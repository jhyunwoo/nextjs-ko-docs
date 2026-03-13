import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { DocFrontmatter, RelatedItem } from '@/lib/docs/types'

interface RelatedLinksProps {
  frontmatter: DocFrontmatter
  items: RelatedItem[]
}

export function RelatedLinks({ frontmatter, items }: RelatedLinksProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <section className="related-section">
      <div className="section-heading">
        <h2>{frontmatter.related?.title ?? '관련 문서'}</h2>
        {frontmatter.related?.description ? <p>{frontmatter.related.description}</p> : null}
      </div>

      <div className="card-grid">
        {items.map((item) =>
          item.external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="feature-card"
            >
              <strong>{item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
              <span>
                원문 보기
                <ArrowUpRight size={14} />
              </span>
            </a>
          ) : (
            <Link key={item.href} href={item.href} prefetch={false} className="feature-card">
              <strong>{item.title}</strong>
              {item.description ? <p>{item.description}</p> : null}
              <span>문서 열기</span>
            </Link>
          ),
        )}
      </div>
    </section>
  )
}
