'use client'

import { Moon, SunMedium } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={mounted ? `${nextTheme} 모드로 전환` : '테마 전환'}
      onClick={() => setTheme(nextTheme)}
    >
      {mounted && resolvedTheme === 'dark' ? <SunMedium size={18} /> : <Moon size={18} />}
    </button>
  )
}
