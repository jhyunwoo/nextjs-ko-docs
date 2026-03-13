import type { PropsWithChildren } from 'react'
import type { DocHeading, NavNode } from '@/lib/docs/types'
import { SidebarNav } from '@/components/sidebar-nav'
import { SiteHeader } from '@/components/site-header'
import { TocNav } from '@/components/toc-nav'

interface DocsShellProps extends PropsWithChildren {
  navigation: NavNode[]
  currentRoute: string
  headings: DocHeading[]
}

export function DocsShell({ navigation, currentRoute, headings, children }: DocsShellProps) {
  return (
    <div className="docs-shell">
      <aside className="docs-sidebar desktop-only">
        <SidebarNav navigation={navigation} currentRoute={currentRoute} />
      </aside>

      <div className="docs-main">
        <SiteHeader navigation={navigation} currentRoute={currentRoute} />
        <div className="docs-content-grid">
          <main className="docs-article-column">{children}</main>
          <div className="docs-toc-column">
            <TocNav headings={headings} />
          </div>
        </div>
      </div>
    </div>
  )
}
