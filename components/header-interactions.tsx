'use client'

import dynamic from 'next/dynamic'
import { Menu, Search } from 'lucide-react'
import type { NavNode } from '@/lib/docs/types'
import { ThemeToggle } from '@/components/theme-toggle'

const SearchDialog = dynamic(() => import('@/components/search-dialog').then((module) => module.SearchDialog), {
  ssr: false,
  loading: () => (
    <button type="button" className="search-trigger" aria-label="문서 검색">
      <Search size={16} />
      <span>문서 검색</span>
      <kbd>⌘K</kbd>
    </button>
  ),
})

const MobileSidebar = dynamic(() => import('@/components/mobile-sidebar').then((module) => module.MobileSidebar), {
  ssr: false,
  loading: () => (
    <button type="button" className="icon-button mobile-only" aria-label="메뉴 열기">
      <Menu size={18} />
    </button>
  ),
})

interface HeaderInteractionsProps {
  navigation: NavNode[]
  currentRoute: string
  mode: 'mobile' | 'actions'
}

export function HeaderInteractions({ navigation, currentRoute, mode }: HeaderInteractionsProps) {
  if (mode === 'mobile') {
    return <MobileSidebar navigation={navigation} currentRoute={currentRoute} />
  }

  return (
    <div className="site-header-right">
      <SearchDialog />
      <ThemeToggle />
    </div>
  )
}
