'use client'

import { Check, Copy } from 'lucide-react'
import { useState, useRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'

export function MdxPre(props: ComponentPropsWithoutRef<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  return (
    <div className="mdx-pre">
      <button
        type="button"
        className="copy-button"
        onClick={async () => {
          const value = ref.current?.innerText ?? ''
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        }}
        aria-label={copied ? '복사됨' : '코드 복사'}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <pre ref={ref} {...props} />
    </div>
  )
}
