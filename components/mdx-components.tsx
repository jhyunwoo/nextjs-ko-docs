import Link from 'next/link'
import { Check as CheckIcon, ExternalLink, X as CrossIcon } from 'lucide-react'
import type { ComponentPropsWithoutRef, PropsWithChildren } from 'react'
import { DocImage } from '@/components/doc-image'
import { MdxPre } from '@/components/mdx-pre'
import { cn } from '@/lib/utils'

export function getMdxComponents() {
  return {
    a: DocLink,
    pre: MdxPre,
    table: TableWrapper,
    details: Details,
    summary: Summary,
    Image: ThemedImage,
    Video: DocVideo,
    Check: Check,
    Cross: Cross,
  }
}

function DocLink({
  href = '',
  className,
  children,
  ...props
}: PropsWithChildren<ComponentPropsWithoutRef<'a'>>) {
  const internal =
    href === '/' || href.startsWith('/app') || href.startsWith('/architecture') || href.startsWith('/community')

  if (href.startsWith('#')) {
    return (
      <a href={href} className={cn('doc-inline-link', className)} {...props}>
        {children}
      </a>
    )
  }

  if (internal) {
    return (
      <Link href={href} prefetch={false} className={cn('doc-inline-link', className)}>
        {children}
      </Link>
    )
  }

  return (
    <a
      href={href}
      className={cn('doc-inline-link external', className)}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      <span>{children}</span>
      <ExternalLink size={14} />
    </a>
  )
}

function TableWrapper({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="table-scroll">
      <table className={cn('doc-table', className)} {...props} />
    </div>
  )
}

function Details(props: ComponentPropsWithoutRef<'details'>) {
  return <details className="doc-details" {...props} />
}

function Summary(props: ComponentPropsWithoutRef<'summary'>) {
  return <summary className="doc-summary" {...props} />
}

function ThemedImage({
  alt,
  src,
  srcLight,
  srcDark,
  width,
  height,
  caption,
}: {
  alt: string
  src?: string
  srcLight?: string
  srcDark?: string
  width?: string | number
  height?: string | number
  caption?: string
}) {
  return (
    <figure className="doc-figure">
      <DocImage alt={alt} src={src} srcLight={srcLight} srcDark={srcDark} width={width} height={height} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}

function DocVideo({
  src,
  caption,
  width,
  height,
}: {
  src: string
  caption?: string
  width?: string | number
  height?: string | number
}) {
  return (
    <figure className="doc-figure">
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        className="doc-video"
        width={width}
        height={height}
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}

function Check({ size = 18 }: { size?: number }) {
  return <CheckIcon size={size} className="icon-check" aria-hidden="true" />
}

function Cross({ size = 18 }: { size?: number }) {
  return <CrossIcon size={size} className="icon-cross" aria-hidden="true" />
}
