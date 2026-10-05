export interface AppleMusicArtwork {
  width?: number;
  height?: number;
  url?: string;
  bgColor?: string;
  textColor1?: string;
  textColor2?: string;
  textColor3?: string;
  textColor4?: string;
}

export interface AppleMusicPlayParams {
  id?: string;
  kind?: string;
  version?: string;
  isLibrary?: boolean;
  globalId?: string;
  catalogId?: string;
  reporting?: boolean;
}

export interface AppleMusicSongAttributes {
  name: string;
  artistName: string;
  albumName?: string;
  durationInMillis?: number;
  isrc?: string;
  url?: string;
  releaseDate?: string;
  trackNumber?: number;
  artwork?: AppleMusicArtwork;
  composerName?: string;
  genreNames?: string[];
  discNumber?: number;
  hasLyrics?: boolean;
  playParams?: AppleMusicPlayParams;
}

export type AppleMusicResourceType =
  | 'songs'
  | 'library-songs'
  | 'playlists'
  | 'library-playlists'
  | 'albums'
  | 'library-albums'
  | string;

export interface AppleMusicRelationship<T = unknown> {
  href?: string;
  data?: T[];
  next?: string;
  meta?: unknown;
}

export interface AppleMusicResource<T = unknown> {
  id: string;
  type: AppleMusicResourceType;
  href?: string;
  attributes: T;
  relationships?: {
    tracks?: AppleMusicRelationship<AppleMusicResource<AppleMusicSongAttributes>>;
    [key: string]: AppleMusicRelationship<unknown> | unknown;
  };
  meta?: unknown;
}

export interface AppleMusicPlaylistAttributes {
  name: string;
  description?:
    | {
        standard?: string;
        short?: string;
      }
    | string;
  curatorName?: string;
  isChart?: boolean;
  trackTypes?: string[];
  url?: string;
  artwork?: AppleMusicArtwork;
  playParams?: AppleMusicPlayParams;
  lastModifiedDate?: string;
  canEdit?: boolean;
  hasCatalog?: boolean;
}

export interface AppleMusicResponse<T> {
  data: T[];
  next?: string;
  meta?: unknown;
}

export interface AppleMusicSearchResponse {
  results: {
    songs?: AppleMusicResponse<AppleMusicResource<AppleMusicSongAttributes>>;
    playlists?: AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>>;
    [key: string]: unknown;
  };
  meta?: unknown;
}

export interface AppleMusicError {
  id?: string;
  title?: string;
  detail?: string;
  status?: string;
  code?: string;
  source?: {
    parameter?: string;
    pointer?: string;
  };
}

export interface AppleMusicErrorResponse {
  errors: AppleMusicError[];
}

export interface AppleMusicAuthTokens {
  developerToken?: string;
  musicUserToken?: string;
  storefront?: string;
}

export interface AppleMusicTrackIdentifier {
  id: string;
  type: 'songs' | 'library-songs' | string;
}

/**
 * Formats an Apple Music artwork template URL by replacing {w} and {h} with the requested size.
 */
export function formatArtworkUrl(artwork?: AppleMusicArtwork, size = 300): string | undefined {
  if (!artwork?.url) return undefined;
  return artwork.url.replace('{w}', String(size)).replace('{h}', String(size));
}
