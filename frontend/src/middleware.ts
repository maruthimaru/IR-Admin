import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Hostnames that are NOT tenants — the main platform domain(s). */
const MAIN_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'infinitroot.com',
  `www.${process.env.NEXT_PUBLIC_BASE_DOMAIN ?? 'infinitroot.com'}`,
]);

/**
 * Extract tenant subdomain from host.
 * "pandaprabha.localhost"  → "pandaprabha"
 * "acme.infinitroot.com"   → "acme"
 * "localhost"              → null  (main platform)
 * "infinitroot.com"        → null  (main platform)
 */
function getTenantSubdomain(host: string): string | null {
  // Strip port
  const hostname = host.split(':')[0];

  if (MAIN_HOSTS.has(hostname)) return null;

  const parts = hostname.split('.');
  if (parts.length < 2) return null;

  const subdomain = parts[0];
  // Exclude "www" and empty strings
  if (!subdomain || subdomain === 'www') return null;

  return subdomain;
}

export function middleware(request: NextRequest) {
  const host      = request.headers.get('host') ?? '';
  const subdomain = getTenantSubdomain(host);
  const { pathname } = request.nextUrl;

  // ── Tenant subdomain detected ─────────────────────────────────
  if (subdomain) {
    const tenantBase = `/${subdomain}`;

    // Already on a correct tenant path — let it through
    if (pathname.startsWith(tenantBase)) {
      return NextResponse.next();
    }

    // Block super-admin access from tenant subdomains
    if (pathname.startsWith('/super-admin')) {
      const url = request.nextUrl.clone();
      url.pathname = `${tenantBase}/login`;
      return NextResponse.redirect(url);
    }

    // Redirect root and all auth/* paths → tenant login
    if (pathname === '/' || pathname.startsWith('/auth')) {
      const url = request.nextUrl.clone();
      url.pathname = `${tenantBase}/login`;
      return NextResponse.redirect(url);
    }

    // Any other unknown path → tenant login
    const url = request.nextUrl.clone();
    url.pathname = `${tenantBase}/login`;
    return NextResponse.redirect(url);
  }

  // ── Main platform domain — no subdomain ───────────────────────
  // Leave all requests untouched
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/* (all Next.js internals: static, image, RSC data, etc.)
     * - favicon.ico, robots.txt, sitemap.xml
     */
    '/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
