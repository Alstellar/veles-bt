const RAW_ALLOWED_ORIGINS = [
  'https://veles.finance',
  'https://ru.veles.finance'
] as const;

export type VelesOrigin = (typeof RAW_ALLOWED_ORIGINS)[number];

export const VELES_ALLOWED_ORIGINS: readonly VelesOrigin[] = RAW_ALLOWED_ORIGINS;
export const VELES_DEFAULT_ORIGIN: VelesOrigin = RAW_ALLOWED_ORIGINS[0];

export const VELES_HOST_PATTERNS: readonly string[] = RAW_ALLOWED_ORIGINS.map(
  (origin) => `${origin}/*`
);

export const VELES_API_REQUEST_PATTERNS: readonly string[] = RAW_ALLOWED_ORIGINS.map(
  (origin) => `${origin}/api/*`
);

const ORIGIN_SET = new Set<string>(RAW_ALLOWED_ORIGINS);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SHARE_HOST_RE = RAW_ALLOWED_ORIGINS
  .map((origin) => new URL(origin).host)
  .map((host) => escapeRegExp(host))
  .join('|');

const SHARE_LINK_RE = new RegExp(`^https://(?:${SHARE_HOST_RE})/share/([A-Za-z0-9_-]+)/?$`, 'i');

export interface ParsedVelesShareLink {
  code: string;
  origin: VelesOrigin;
  url: string;
}

export const isVelesOrigin = (origin?: string | null): origin is VelesOrigin => {
  if (!origin) return false;
  return ORIGIN_SET.has(origin);
};

export const toVelesOrigin = (origin?: string | null): VelesOrigin => {
  if (isVelesOrigin(origin)) return origin;
  return VELES_DEFAULT_ORIGIN;
};

export const getVelesOriginFromUrl = (url?: string | null): VelesOrigin | null => {
  if (!url) return null;
  try {
    const origin = new URL(url).origin;
    return isVelesOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
};

export const parseVelesShareLink = (link: string): ParsedVelesShareLink | null => {
  const normalized = link.trim();
  if (!normalized) return null;
  const match = normalized.match(SHARE_LINK_RE);
  if (!match) return null;

  const code = match[1];
  const origin = getVelesOriginFromUrl(normalized);
  if (!origin) return null;

  return {
    code,
    origin,
    url: `${origin}/share/${code}`
  };
};

export const getVelesApiUrl = (path: string, origin?: string | null): string => {
  const base = toVelesOrigin(origin);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api${normalizedPath}`;
};

export const getVelesCabinetUrl = (origin?: string | null): string =>
  `${toVelesOrigin(origin)}/cabinet`;

export const getVelesShareUrl = (code: string, origin?: string | null): string =>
  `${toVelesOrigin(origin)}/share/${code}`;

export const getVelesCabinetBacktestUrl = (id: number | string, origin?: string | null): string =>
  `${toVelesOrigin(origin)}/cabinet/backtests/${id}`;

export const getVelesPublicBacktestUrl = (id: number | string, origin?: string | null): string =>
  `${toVelesOrigin(origin)}/backtests/${id}`;
