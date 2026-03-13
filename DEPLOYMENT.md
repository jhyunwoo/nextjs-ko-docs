# Deployment Checklist

## Performance

- Set `NEXT_PUBLIC_SITE_URL` in production so canonical URLs, Open Graph URLs, and `sitemap.xml` use the real domain.
- Serve Brotli first and Gzip as fallback for HTML, CSS, JS, JSON, XML, SVG.
- Cache `/_next/static/*` with `Cache-Control: public, max-age=31536000, immutable`.
- Cache `/docs/*`, `/learn/*`, `/videos/*`, `/favicon.svg`, `/og-cover.svg` with `Cache-Control: public, max-age=31536000, immutable`.
- Cache `/*.html`, `/robots.txt`, `/sitemap.xml`, `/search-index.json` with a short TTL or `no-cache` so updates publish quickly.
- Prefer HTTP/2 or HTTP/3 on the CDN/edge.

## Security

- Add response-level `Content-Security-Policy` at the CDN or static host. Start with a report-only policy if you need to verify compatibility first.
- Add `X-Content-Type-Options: nosniff`.
- Add `Referrer-Policy: strict-origin-when-cross-origin` if your host does not automatically honor document metadata.
- Add a clickjacking policy with `frame-ancestors 'none'` in CSP or `X-Frame-Options: DENY`.
- Restrict unexpected methods at the edge for static hosting if your platform allows it.

## Validation

- Verify `robots.txt` and `sitemap.xml` are reachable on the production domain.
- Run a Lighthouse check against the deployed home page and a representative deep doc page.
- Confirm the CDN returns long-lived cache headers for static assets and short-lived headers for HTML.
