'use client'

import { Command } from 'cmdk'
import { Search, FileText, CornerDownLeft } from 'lucide-react'
import MiniSearch from 'minisearch'
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { SearchRecord } from '@/lib/docs/types'

export function SearchDialog() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [records, setRecords] = useState<SearchRecord[]>([])
  const [searchIndex, setSearchIndex] = useState<MiniSearch<SearchRecord> | null>(null)
  const [results, setResults] = useState<SearchRecord[]>([])
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    if (!open || searchIndex) {
      return
    }

    let active = true

    void fetch('/search-index.json', { cache: 'force-cache' })
      .then((response) => response.json() as Promise<SearchRecord[]>)
      .then((data) => {
        if (!active) {
          return
        }

        const index = new MiniSearch<SearchRecord>({
          fields: ['title', 'description', 'headings', 'body'],
          storeFields: ['route', 'title', 'description', 'excerpt', 'section'],
          searchOptions: {
            boost: {
              title: 4,
              description: 2,
              headings: 2.5,
              body: 1,
            },
            prefix: true,
            fuzzy: 0.15,
          },
        })

        index.addAll(data)
        setRecords(data)
        setSearchIndex(index)
        setResults(data.slice(0, 12))
      })

    return () => {
      active = false
    }
  }, [open, searchIndex])

  useEffect(() => {
    if (!searchIndex) {
      return
    }

    if (!deferredQuery.trim()) {
      setResults(records.slice(0, 12))
      return
    }

    startTransition(() => {
      const matches = searchIndex.search(deferredQuery).slice(0, 12)
      setResults(
        matches.map((match) => ({
          id: String(match.id),
          route: String(match.route ?? ''),
          title: String(match.title ?? ''),
          description: String(match.description ?? ''),
          headings: [],
          body: '',
          excerpt: String(match.excerpt ?? ''),
          section: (match.section ?? 'app') as SearchRecord['section'],
        })),
      )
    })
  }, [deferredQuery, records, searchIndex])

  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [pathname])

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      setOpen((previous) => !previous)
      return
    }

    if (event.key === 'Escape') {
      setOpen(false)
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onKeyDown])

  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOpen(true)}>
        <Search size={16} />
        <span>문서 검색</span>
        <kbd>⌘K</kbd>
      </button>

      {open ? (
        <div className="search-overlay" role="presentation" onClick={() => setOpen(false)}>
          <div className="search-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <Command shouldFilter={false} label="문서 검색" className="command-root">
              <div className="command-input-wrap">
                <Search size={16} />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="제목, 설명, 본문에서 검색"
                  className="command-input"
                  autoFocus
                />
              </div>

              <Command.List className="command-list">
                {results.length === 0 ? (
                  <div className="command-empty">검색 결과가 없습니다.</div>
                ) : null}

                {results.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.title} ${item.route}`}
                    className="command-item"
                    onSelect={() => {
                      router.push(item.route)
                      setOpen(false)
                    }}
                  >
                    <FileText size={16} />
                    <div className="command-item-copy">
                      <strong>{item.title}</strong>
                      <p>{item.excerpt || item.description}</p>
                      <span>{item.route}</span>
                    </div>
                    <CornerDownLeft size={14} className="command-item-enter" />
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  )
}
