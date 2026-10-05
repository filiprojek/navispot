export interface ParsedAppleMusicUrl {
  storefront: string;
  type: 'playlist' | 'song' | 'album';
  id: string;
  name?: string;
}

const VALID_HOSTNAMES = new Set([
  'music.apple.com',
  'beta.music.apple.com',
  'geo.music.apple.com',
]);

/**
 * Parses an Apple Music URL into its components (storefront, type, id, and optional name).
 *
 * Supported formats:
 * - https://music.apple.com/:storefront/playlist/:name/:id
 * - https://music.apple.com/:storefront/playlist/:id
 * - https://music.apple.com/:storefront/album/:name/:id?i=:trackId (resolves to type: 'song')
 * - https://music.apple.com/:storefront/album/:name/:id (resolves to type: 'album')
 * - https://music.apple.com/:storefront/album/:id (resolves to type: 'album')
 * - https://music.apple.com/:storefront/song/:name/:id (resolves to type: 'song')
 * - https://music.apple.com/:storefront/song/:id (resolves to type: 'song')
 */
export function parseAppleMusicUrl(url: string): ParsedAppleMusicUrl | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const urlObj = new URL(
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`
    );

    if (!VALID_HOSTNAMES.has(urlObj.hostname.toLowerCase())) {
      return null;
    }

    const segments = urlObj.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    let storefront: string;
    let kind: string;
    let nameAndIdSegments: string[];

    if (['playlist', 'album', 'song'].includes(segments[0].toLowerCase())) {
      storefront = 'us';
      kind = segments[0].toLowerCase();
      nameAndIdSegments = segments.slice(1);
    } else {
      storefront = segments[0].toLowerCase();
      kind = segments[1].toLowerCase();
      nameAndIdSegments = segments.slice(2);
    }

    if (kind !== 'playlist' && kind !== 'album' && kind !== 'song') {
      return null;
    }

    if (nameAndIdSegments.length === 0) {
      return null;
    }

    let id: string;
    let name: string | undefined;

    if (nameAndIdSegments.length === 1) {
      id = nameAndIdSegments[0];
    } else {
      name = nameAndIdSegments.slice(0, -1).join('/');
      id = nameAndIdSegments[nameAndIdSegments.length - 1];
    }

    // Clean query parameters and handle album track selector ?i=:trackId
    if (kind === 'album') {
      const trackId = urlObj.searchParams.get('i');
      if (trackId) {
        return {
          storefront,
          type: 'song',
          id: trackId,
          name,
        };
      }
      return {
        storefront,
        type: 'album',
        id,
        name,
      };
    }

    if (kind === 'song') {
      return {
        storefront,
        type: 'song',
        id,
        name,
      };
    }

    if (kind === 'playlist') {
      return {
        storefront,
        type: 'playlist',
        id,
        name,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks if a string is a valid Apple Music URL.
 */
export function isAppleMusicUrl(url: string): boolean {
  return parseAppleMusicUrl(url) !== null;
}

/**
 * Extracts a playlist ID from an Apple Music URL or raw playlist ID string.
 * Supports catalog playlist IDs (pl.xxx) and personal/shared library playlist IDs (pl.u-xxx).
 */
export function extractPlaylistId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // Direct playlist ID format
  if (/^pl\.(u-)?[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = parseAppleMusicUrl(trimmed);
  if (parsed && parsed.type === 'playlist') {
    return parsed.id;
  }

  return null;
}
