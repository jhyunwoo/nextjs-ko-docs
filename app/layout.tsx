import type { Metadata } from 'next'
import '@fontsource/ibm-plex-sans-kr/400.css'
import '@fontsource/ibm-plex-sans-kr/500.css'
import '@fontsource/ibm-plex-sans-kr/600.css'
import '@fontsource/ibm-plex-sans-kr/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import { ThemeProvider } from '@/components/theme-provider'
import { getSiteOrigin, SITE_DESCRIPTION, SITE_KEYWORDS, SITE_LOCALE, SITE_NAME, SITE_OG_IMAGE_PATH } from '@/lib/docs/site'
import { buildWebSiteJsonLd, stringifyJsonLd } from '@/lib/seo'
import '@/app/globals.css'

const siteOrigin = getSiteOrigin()
const socialImage = siteOrigin ? `${siteOrigin}${SITE_OG_IMAGE_PATH}` : undefined
const webSiteJsonLd = buildWebSiteJsonLd()

export const metadata: Metadata = {
  metadataBase: siteOrigin ? new URL(siteOrigin) : undefined,
  applicationName: SITE_NAME,
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [...SITE_KEYWORDS],
  category: 'technology',
  referrer: 'strict-origin-when-cross-origin',
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: SITE_LOCALE,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: socialImage
      ? [
          {
            url: socialImage,
            width: 1200,
            height: 630,
            alt: SITE_NAME,
          },
        ]
      : undefined,
  },
  twitter: {
    card: socialImage ? 'summary_large_image' : 'summary',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: socialImage ? [socialImage] : undefined,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {webSiteJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: stringifyJsonLd(webSiteJsonLd) }}
          />
        ) : null}
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
