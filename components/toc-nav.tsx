import type { DocHeading } from '@/lib/docs/types'

interface TocNavProps {
  headings: DocHeading[]
}

export function TocNav({ headings }: TocNavProps) {
  const items = headings.filter((heading) => heading.depth >= 2 && heading.depth <= 3)

  if (items.length === 0) {
    return null
  }

  return (
    <nav className="toc-nav" aria-label="문서 목차">
      <div className="toc-card">
        <p className="toc-title">이 페이지에서</p>
        <ul>
          {items.map((heading) => (
            <li key={heading.id} data-depth={heading.depth}>
              <a href={`#${heading.id}`}>{heading.text}</a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
