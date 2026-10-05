import {
  AppleMusicAuthTokens,
  AppleMusicError,
  AppleMusicErrorResponse,
  AppleMusicPlaylistAttributes,
  AppleMusicResource,
  AppleMusicResponse,
  AppleMusicSearchResponse,
  AppleMusicSongAttributes,
  AppleMusicTrackIdentifier,
} from './types';
import { getStoredTokens, getDeveloperToken } from './token-manager';

export const DEFAULT_APPLE_MUSIC_BASE_URL = 'https://api.music.apple.com/v1';
export const AMP_APPLE_MUSIC_BASE_URL = 'https://amp-api.music.apple.com/v1';

export class AppleMusicApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly errors?: AppleMusicError[];

  constructor(status: number, body: string, errors?: AppleMusicError[]) {
    let detail = '';
    if (errors && errors.length > 0) {
      detail = errors.map((e) => e.detail || e.title || '').filter(Boolean).join('; ');
    }
    const msg = detail
      ? `Apple Music API error ${status}: ${detail}`
      : `Apple Music API error ${status}: ${body.slice(0, 200)}`;
    super(msg);
    this.name = 'AppleMusicApiError';
    this.status = status;
    this.body = body;
    this.errors = errors;
  }
}

export interface AppleMusicClientConfig {
  developerToken?: string;
  musicUserToken?: string;
  storefront?: string;
  baseUrl?: string;
}

export class AppleMusicClient {
  private developerToken?: string;
  private musicUserToken?: string;
  private storefront: string;
  private baseUrl: string;

  constructor(config: AppleMusicClientConfig = {}) {
    const stored = typeof window !== 'undefined' ? getStoredTokens() : {};
    const serverDevToken = typeof window === 'undefined' ? getDeveloperToken() : null;

    this.developerToken = config.developerToken || stored.developerToken || serverDevToken || undefined;
    this.musicUserToken = config.musicUserToken || stored.musicUserToken || undefined;
    this.storefront = (config.storefront || stored.storefront || 'us').toLowerCase();
    this.baseUrl = (config.baseUrl || DEFAULT_APPLE_MUSIC_BASE_URL).replace(/\/+$/, '');
  }

  setTokens(tokens: { developerToken?: string; musicUserToken?: string; storefront?: string }): void {
    if (tokens.developerToken !== undefined) this.developerToken = tokens.developerToken;
    if (tokens.musicUserToken !== undefined) this.musicUserToken = tokens.musicUserToken;
    if (tokens.storefront !== undefined) this.storefront = tokens.storefront.toLowerCase();
  }

  getTokens(): AppleMusicAuthTokens {
    return {
      developerToken: this.developerToken,
      musicUserToken: this.musicUserToken,
      storefront: this.storefront,
    };
  }

  getStorefront(): string {
    return this.storefront;
  }

  setStorefront(storefront: string): void {
    this.storefront = storefront.toLowerCase();
  }

  isAuthenticated(): boolean {
    return Boolean(this.developerToken && this.musicUserToken);
  }

  hasDeveloperToken(): boolean {
    return Boolean(this.developerToken);
  }

  private async fetch<T>(pathOrUrl: string, init: RequestInit = {}): Promise<T> {
    const isAbsolute = /^https?:\/\//i.test(pathOrUrl);
    const url = isAbsolute
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;

    const headers = new Headers(init.headers || {});
    if (this.developerToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${this.developerToken}`);
    }
    if (this.musicUserToken && !headers.has('Music-User-Token')) {
      headers.set('Music-User-Token', this.musicUserToken);
    }
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const rawText = await response.text().catch(() => '');
      let errors: AppleMusicError[] | undefined;
      try {
        const errorJson = JSON.parse(rawText) as AppleMusicErrorResponse;
        if (Array.isArray(errorJson.errors)) {
          errors = errorJson.errors;
        }
      } catch {
        // Not a JSON error payload
      }
      throw new AppleMusicApiError(response.status, rawText, errors);
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }

    const text = await response.text();
    if (!text) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  /**
   * Fetches a page of the user's library playlists.
   */
  async getLibraryPlaylists(options?: {
    limit?: number;
    offset?: number;
    signal?: AbortSignal;
  }): Promise<AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>>> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const endpoint = `/me/library/playlists?limit=${limit}&offset=${offset}`;
    return this.fetch<AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>>>(
      endpoint,
      { signal: options?.signal }
    );
  }

  /**
   * Fetches all playlists in the user's library, automatically traversing pagination.
   */
  async getAllLibraryPlaylists(
    signal?: AbortSignal
  ): Promise<AppleMusicResource<AppleMusicPlaylistAttributes>[]> {
    const all: AppleMusicResource<AppleMusicPlaylistAttributes>[] = [];
    let nextUrl: string | undefined = `/me/library/playlists?limit=100`;

    while (nextUrl) {
      const res: AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>> =
        await this.fetch(nextUrl, { signal });
      const items = res.data || [];
      all.push(...items);

      if (items.length === 0 || !res.next) {
        break;
      }
      nextUrl = res.next;
    }

    return all;
  }

  /**
   * Fetches all tracks for a specific user library playlist.
   */
  async getLibraryPlaylistTracks(
    playlistId: string,
    options?: { signal?: AbortSignal }
  ): Promise<AppleMusicResource<AppleMusicSongAttributes>[]> {
    const tracks: AppleMusicResource<AppleMusicSongAttributes>[] = [];
    let nextUrl: string | undefined = `/me/library/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100`;

    while (nextUrl) {
      const res: AppleMusicResponse<AppleMusicResource<AppleMusicSongAttributes>> =
        await this.fetch(nextUrl, { signal: options?.signal });
      const items = res.data || [];
      tracks.push(...items);

      if (items.length === 0 || !res.next) {
        break;
      }
      nextUrl = res.next;
    }

    return tracks;
  }

  /**
   * Fetches all songs in the user's personal library (loved/saved favorites).
   */
  async getLibrarySongs(
    options?: { signal?: AbortSignal }
  ): Promise<AppleMusicResource<AppleMusicSongAttributes>[]> {
    const songs: AppleMusicResource<AppleMusicSongAttributes>[] = [];
    let nextUrl: string | undefined = `/me/library/songs?limit=100`;

    while (nextUrl) {
      const res: AppleMusicResponse<AppleMusicResource<AppleMusicSongAttributes>> =
        await this.fetch(nextUrl, { signal: options?.signal });
      const items = res.data || [];
      songs.push(...items);

      if (items.length === 0 || !res.next) {
        break;
      }
      nextUrl = res.next;
    }

    return songs;
  }

  /**
   * Fetches a catalog playlist along with all of its tracks.
   */
  async getCatalogPlaylist(
    storefront: string,
    playlistId: string,
    signal?: AbortSignal
  ): Promise<{
    playlist: AppleMusicResource<AppleMusicPlaylistAttributes>;
    tracks: AppleMusicResource<AppleMusicSongAttributes>[];
  }> {
    const sf = (storefront || this.storefront).toLowerCase();
    const endpoint = `/catalog/${sf}/playlists/${encodeURIComponent(playlistId)}`;

    const res = await this.fetch<AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>>>(
      endpoint,
      { signal }
    );

    if (!res.data || res.data.length === 0) {
      throw new AppleMusicApiError(404, `Catalog playlist not found: ${playlistId}`);
    }

    const playlist = res.data[0];
    const tracks: AppleMusicResource<AppleMusicSongAttributes>[] = [];

    const initialTracks = (playlist.relationships?.tracks?.data as AppleMusicResource<AppleMusicSongAttributes>[]) || [];
    tracks.push(...initialTracks);

    let nextUrl: string | undefined = playlist.relationships?.tracks?.next;
    while (nextUrl) {
      const pageRes: AppleMusicResponse<AppleMusicResource<AppleMusicSongAttributes>> =
        await this.fetch(nextUrl, { signal });
      const items = pageRes.data || [];
      tracks.push(...items);
      if (items.length === 0 || !pageRes.next) {
        break;
      }
      nextUrl = pageRes.next;
    }

    return {
      playlist,
      tracks,
    };
  }

  /**
   * Searches the Apple Music catalog for songs matching an ISRC.
   */
  async searchByIsrc(
    isrc: string,
    storefront?: string,
    signal?: AbortSignal
  ): Promise<AppleMusicResource<AppleMusicSongAttributes>[]> {
    const sf = (storefront || this.storefront).toLowerCase();
    const endpoint = `/catalog/${sf}/songs?filter[isrc]=${encodeURIComponent(isrc)}`;

    const res = await this.fetch<AppleMusicResponse<AppleMusicResource<AppleMusicSongAttributes>>>(
      endpoint,
      { signal }
    );

    return res.data || [];
  }

  /**
   * Searches the Apple Music catalog for songs matching a text query.
   */
  async searchSongs(
    query: string,
    storefront?: string,
    limit = 25,
    signal?: AbortSignal
  ): Promise<AppleMusicResource<AppleMusicSongAttributes>[]> {
    const sf = (storefront || this.storefront).toLowerCase();
    const endpoint = `/catalog/${sf}/search?term=${encodeURIComponent(query)}&types=songs&limit=${limit}`;

    const res = await this.fetch<AppleMusicSearchResponse>(endpoint, { signal });
    return res.results?.songs?.data || [];
  }

  /**
   * Creates a new playlist in the user's library.
   */
  async createLibraryPlaylist(
    name: string,
    description?: string,
    trackData?: AppleMusicTrackIdentifier[]
  ): Promise<{ id: string; success: boolean }> {
    const body: Record<string, unknown> = {
      attributes: {
        name,
        description: description || '',
      },
    };

    if (trackData && trackData.length > 0) {
      body.relationships = {
        tracks: {
          data: trackData,
        },
      };
    }

    const res = await this.fetch<AppleMusicResponse<AppleMusicResource<AppleMusicPlaylistAttributes>>>(
      '/me/library/playlists',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    const created = res.data?.[0];
    if (!created?.id) {
      throw new AppleMusicApiError(500, 'Apple Music did not return a valid playlist ID upon creation');
    }

    return { id: created.id, success: true };
  }

  /**
   * Appends tracks to an existing playlist in the user's library.
   * Batches in chunks of 100 tracks to respect Apple Music API constraints.
   */
  async addTracksToLibraryPlaylist(
    playlistId: string,
    trackData: AppleMusicTrackIdentifier[]
  ): Promise<{ success: boolean }> {
    if (trackData.length === 0) {
      return { success: true };
    }

    const CHUNK_SIZE = 100;
    for (let i = 0; i < trackData.length; i += CHUNK_SIZE) {
      const chunk = trackData.slice(i, i + CHUNK_SIZE);
      await this.fetch(`/me/library/playlists/${encodeURIComponent(playlistId)}/tracks`, {
        method: 'POST',
        body: JSON.stringify({ data: chunk }),
      });
    }

    return { success: true };
  }

  /**
   * Saves a catalog song to the user's personal library.
   */
  async addSongToLibrary(songId: string): Promise<{ success: boolean }> {
    await this.fetch(`/me/library?ids[songs]=${encodeURIComponent(songId)}`, {
      method: 'POST',
    });
    return { success: true };
  }
}

export const createAppleMusicClient = (config?: AppleMusicClientConfig): AppleMusicClient =>
  new AppleMusicClient(config);
