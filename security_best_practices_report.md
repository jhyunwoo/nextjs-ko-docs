# Security Best Practices Report

## Executive Summary

This review covered the Next.js static documentation site, its deployment defaults, and client-side interaction code.

- No open `npm audit` vulnerabilities remain after remediation.
- No critical or high-severity application-code findings are currently open.
- One deployment-time verification item remains: response-level security headers must be configured at the CDN/static host because this repo exports static files and does not include provider-specific edge header config.

## Remediated Findings

### RESOLVED-001

- Rule ID: NEXT-SUPPLY-001
- Severity: High
- Location: `/Users/jhyunwoo/projects/nextjs-docs-ko/package.json:33`
- Evidence: `next-mdx-remote` was upgraded from `^5.0.0` to `^6.0.0`.
- Impact: `npm audit` previously reported `GHSA-g4xw-jxrg-5f6m`, an arbitrary code execution advisory affecting older `next-mdx-remote` versions when rendering untrusted MDX.
- Fix: upgraded to `next-mdx-remote@^6.0.0` and reinstalled dependencies.
- Mitigation: keep dependency updates in regular maintenance and rerun `npm audit --omit=dev` in CI before release.
- False positive notes: this site only compiles trusted local MDX at build time, which reduced immediate exposure even before the upgrade, but the dependency still needed patching.

### RESOLVED-002

- Rule ID: REACT-NAV-001
- Severity: Low
- Location: `/Users/jhyunwoo/projects/nextjs-docs-ko/components/mdx-components.tsx:47-53`
- Evidence: external document links now use `rel="noopener noreferrer"`.
- Impact: without `noopener`, newly opened tabs can retain a reference to the opener window.
- Fix: strengthened external link rel attributes for MDX-rendered links.
- Mitigation: keep all future `_blank` links on the same pattern.
- False positive notes: `noreferrer` often implies `noopener` in modern browsers, but making both explicit is the safer default.

### RESOLVED-003

- Rule ID: REACT-NAV-001
- Severity: Low
- Location: `/Users/jhyunwoo/projects/nextjs-docs-ko/components/related-links.tsx:25-30`
- Evidence: external related-document cards now use `rel="noopener noreferrer"`.
- Impact: same opener risk as above for external tabs.
- Fix: strengthened external link rel attributes for related links.
- Mitigation: keep link helpers centralized where possible.
- False positive notes: same browser note as above.

### RESOLVED-004

- Rule ID: NEXT-DEPLOY-001
- Severity: Low
- Location: `/Users/jhyunwoo/projects/nextjs-docs-ko/next.config.mjs:2-9`
- Evidence: `poweredByHeader: false` and `productionBrowserSourceMaps: false` are now explicitly set.
- Impact: reduces framework fingerprinting and avoids accidental public source map exposure during deployment.
- Fix: hardened production config defaults in `next.config.mjs`.
- Mitigation: keep production-only defaults explicit instead of relying on platform assumptions.
- False positive notes: with static export, `x-powered-by` is not usually emitted, but the explicit setting is still the right default.

## Open Verification Items

### VERIFY-001

- Rule ID: NEXT-HEADERS-001
- Severity: Medium
- Location: `/Users/jhyunwoo/projects/nextjs-docs-ko/next.config.mjs:2-9`
- Evidence: the site is configured as a generic static export (`output: 'export'`), and there is no provider-specific edge headers configuration file in this repo.
- Impact: CSP, clickjacking protection, and `nosniff` are not enforced from application code. If the static host does not add them, defense-in-depth against XSS, MIME confusion, and framing attacks will be weaker than recommended.
- Fix: configure response headers at the CDN/static host. The deployment checklist in `/Users/jhyunwoo/projects/nextjs-docs-ko/DEPLOYMENT.md` includes the recommended baseline.
- Mitigation: if your platform supports it, start with `Content-Security-Policy-Report-Only` and then promote to enforcing mode after validation.
- False positive notes: this may already be handled by your hosting platform; verify with a live response header check after deployment.

## Commands Run

- `npm audit --omit=dev --json`
- `npm run typecheck`
- `npm run build`

## Current Status

- Application build: passing
- Static export: passing
- Dependency audit: 0 vulnerabilities
