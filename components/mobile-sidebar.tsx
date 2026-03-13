'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import type { NavNode } from '@/lib/docs/types'
import { SidebarNav } from '@/components/sidebar-nav'

interface MobileSidebarProps {
  navigation: NavNode[]
  currentRoute: string
}

export function MobileSidebar({ navigation, currentRoute }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="icon-button mobile-only" onClick={() => setOpen(true)} aria-label="메뉴 열기">
        <Menu size={18} />
      </button>

      {open ? (
        <div className="mobile-sidebar-overlay" role="presentation" onClick={() => setOpen(false)}>
          <aside className="mobile-sidebar-panel" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-sidebar-header">
              <strong>문서 탐색</strong>
              <button
                type="button"
                className="icon-button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <SidebarNav navigation={navigation} currentRoute={currentRoute} />
          </aside>
        </div>
      ) : null}
    </>
  )
}
