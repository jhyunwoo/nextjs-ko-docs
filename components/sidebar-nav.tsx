'use client'

import Link from 'next/link'
import type { NavNode } from '@/lib/docs/types'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  navigation: NavNode[]
  currentRoute: string
  className?: string
}

export function SidebarNav({ navigation, currentRoute, className }: SidebarNavProps) {
  return (
    <nav className={cn('sidebar-nav', className)} aria-label="문서 사이드바">
      <Link href="/" prefetch={false} className={cn('sidebar-home', currentRoute === '/' && 'is-active')}>
        문서 홈
      </Link>
      <ul className="sidebar-list">
        {navigation.map((node) => (
          <SidebarNode key={node.key} node={node} currentRoute={currentRoute} depth={0} />
        ))}
      </ul>
    </nav>
  )
}

function SidebarNode({
  node,
  currentRoute,
  depth,
}: {
  node: NavNode
  currentRoute: string
  depth: number
}) {
  const active = node.route === currentRoute
  const ancestor = Boolean(node.route && currentRoute.startsWith(`${node.route}/`))
  const expanded = active || ancestor

  return (
    <li className={cn('sidebar-item', expanded && 'is-expanded')} data-depth={depth}>
      {node.route ? (
        <Link href={node.route} prefetch={false} className={cn('sidebar-link', active && 'is-active', node.kind)}>
          {node.title}
        </Link>
      ) : (
        <span className="sidebar-label">{node.title}</span>
      )}

      {node.children.length > 0 ? (
        <ul className="sidebar-sublist">
          {node.children.map((child) => (
            <SidebarNode key={child.key} node={child} currentRoute={currentRoute} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
