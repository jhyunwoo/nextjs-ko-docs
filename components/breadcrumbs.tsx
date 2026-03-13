import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { BreadcrumbItem } from '@/lib/docs/types'

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <nav className="breadcrumbs" aria-label="현재 위치">
      <ol>
        <li>
          <Link href="/" prefetch={false}>
            홈
          </Link>
        </li>
        {items.map((item) => (
          <li key={item.route}>
            <ChevronRight size={14} />
            <Link href={item.route} prefetch={false}>
              {item.title}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
