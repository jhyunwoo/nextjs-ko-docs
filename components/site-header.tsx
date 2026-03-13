import Link from 'next/link'
import type { NavNode } from '@/lib/docs/types'
import { SITE_NAME, SITE_VERSION } from '@/lib/docs/site'
import { HeaderInteractions } from '@/components/header-interactions'

interface SiteHeaderProps {
  navigation: NavNode[]
  currentRoute: string
}

export function SiteHeader({ navigation, currentRoute }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-left">
          <HeaderInteractions navigation={navigation} currentRoute={currentRoute} mode="mobile" />
          <Link href="/" className="site-brand" prefetch={false}>
            <span className="site-brand-mark">N</span>
            <span className="site-brand-copy">
              <strong>{SITE_NAME}</strong>
              <small>{SITE_VERSION}</small>
            </span>
          </Link>
        </div>

        <HeaderInteractions navigation={navigation} currentRoute={currentRoute} mode="actions" />
      </div>
    </header>
  )
}
