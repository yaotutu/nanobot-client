import { DEFAULT_SERVER_URL } from '@/lib/config';

function officialFaviconUrl(domain: string): string {
  return `https://${domain}/favicon.ico`;
}

function duckDuckGoFaviconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

function googleFaviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function faviconUrls(domain: string): string[] {
  const faviconDomain = faviconDomainFromValue(domain);
  return [
    officialFaviconUrl(faviconDomain),
    duckDuckGoFaviconUrl(faviconDomain),
    googleFaviconUrl(domain),
  ];
}

function addUniqueLogoUrl(urls: string[], url: string | null | undefined): void {
  const resolved = resolveLogoUrl(url);
  if (resolved && !urls.includes(resolved)) urls.push(resolved);
}

function domainFromLogoUrl(url: string): string | null {
  if (url.startsWith('/')) return null;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase();
    if (host === 'www.google.com' || host === 'google.com') {
      return parsed.searchParams.get('domain');
    }
    if (host === 'icons.duckduckgo.com') {
      const match = parsed.pathname.match(/^\/ip3\/(.+)\.ico$/);
      return match ? decodeURIComponent(match[1]) : null;
    }
    if (host === 'favicon.im') {
      return decodeURIComponent(parsed.pathname.replace(/^\//, '')) || null;
    }
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function faviconDomainFromValue(value: string): string {
  const host = value.split('/')[0]?.trim();
  return host || value;
}

export function resolveLogoUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${DEFAULT_SERVER_URL}${trimmed}`;
  return undefined;
}

/**
 * Match WebUI capability branding: try the supplied asset first, then the
 * provider's direct favicon and public favicon services before using initials.
 * Relative server assets are made absolute for React Native image loading.
 */
export function logoFallbackUrls(logoUrl: string | null | undefined): string[] {
  const value = logoUrl?.trim();
  if (!value) return [];
  if (value.startsWith('/')) {
    const resolved = resolveLogoUrl(value);
    return resolved ? [resolved] : [];
  }

  const urls: string[] = [];
  const domain = domainFromLogoUrl(value);
  const isFaviconProxy = /^(https?:\/\/)?(www\.google\.com|google\.com|icons\.duckduckgo\.com)\//i.test(value);
  if (domain && isFaviconProxy) {
    addUniqueLogoUrl(urls, value);
    faviconUrls(domain).forEach((url) => addUniqueLogoUrl(urls, url));
    return urls;
  }
  addUniqueLogoUrl(urls, value);
  if (domain) faviconUrls(domain).forEach((url) => addUniqueLogoUrl(urls, url));
  return urls;
}

/** A repository host favicon identifies GitHub, not the CLI app itself. */
export function isGenericRepositoryLogoUrl(logoUrl: string | null | undefined): boolean {
  const value = logoUrl?.trim();
  if (!value) return false;
  const domain = domainFromLogoUrl(value)?.toLowerCase();
  return domain === 'github.com' || domain?.startsWith('github.com/') === true;
}
