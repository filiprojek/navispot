import {
  DestinationMatchCandidate,
  DestinationProvider,
  ProviderId,
  SourceProvider,
  UnifiedPlaylist,
  UnifiedTrack,
  UnifiedTrackAlbum,
  UnifiedTrackArtist,
} from '@/types/provider';
import {
  AppleMusicPlaylistAttributes,
  AppleMusicResource,
  AppleMusicSongAttributes,
  AppleMusicTrackIdentifier,
  formatArtworkUrl,
} from '@/lib/apple-music/types';
import { AppleMusicClient } from '@/lib/apple-music/client';
import { isAppleMusicUrl, parseAppleMusicUrl } from '@/lib/apple-music/url-parser';

export function toUnifiedTrack(
  appleSong: AppleMusicResource<AppleMusicSongAttributes>
): UnifiedTrack {
  const attrs = appleSong.attributes || ({} as AppleMusicSongAttributes);
  const isrc = attrs.isrc || undefined;
  const artists: UnifiedTrackArtist[] = [
    {
      name: attrs.artistName || 'Unknown Artist',
    },
  ];
  const album: UnifiedTrackAlbum = {
    name: attrs.albumName || '',
    releaseDate: attrs.releaseDate,
  };

  return {
    id: appleSong.id,
    title: attrs.name || '',
    artists,
    album,
    durationMs: attrs.durationInMillis || 0,
    isrc,
    provider: 'apple-music',
    uri: attrs.url || (appleSong.id ? `https://music.apple.com/song/${appleSong.id}` : undefined),
    raw: appleSong,
  };
}

export function toUnifiedPlaylist(
  applePlaylist: AppleMusicResource<AppleMusicPlaylistAttributes>,
  trackCount?: number,
  isLiked?: boolean
): UnifiedPlaylist {
  const attrs = applePlaylist.attributes || ({} as AppleMusicPlaylistAttributes);
  const desc =
    typeof attrs.description === 'string'
      ? attrs.description
      : attrs.description?.standard || attrs.description?.short || '';
  const curator = attrs.curatorName || 'Apple Music';
  const isCatalog = applePlaylist.type === 'playlists';
  const isLikedPlaylist = Boolean(isLiked || applePlaylist.id === 'library-songs');

  const count = trackCount ?? applePlaylist.relationships?.tracks?.data?.length ?? 0;

  return {
    id: applePlaylist.id,
    name: attrs.name || '',
    description: desc,
    owner: {
      id: curator,
      displayName: curator,
    },
    trackCount: count,
    imageUrl: formatArtworkUrl(attrs.artwork),
    provider: 'apple-music',
    isPublic: isCatalog,
    isImported: isCatalog,
    isLikedSongs: isLikedPlaylist,
  };
}

export function toDestinationMatchCandidate(
  appleSong: AppleMusicResource<AppleMusicSongAttributes>
): DestinationMatchCandidate {
  const attrs = appleSong.attributes || ({} as AppleMusicSongAttributes);
  return {
    id: appleSong.id,
    title: attrs.name || '',
    artist: attrs.artistName || 'Unknown Artist',
    album: attrs.albumName || '',
    durationMs: attrs.durationInMillis || 0,
    isrc: attrs.isrc || undefined,
    raw: appleSong,
  };
}

export class AppleMusicAdapter implements SourceProvider, DestinationProvider {
  readonly id: ProviderId = 'apple-music';
  readonly name: string = 'Apple Music';

  constructor(
    private client: AppleMusicClient = new AppleMusicClient(),
    private publicPlaylistFetcher?: (
      url: string
    ) => Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }>
  ) {}

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  isConnected(): boolean {
    return this.client.isAuthenticated();
  }

  async listPlaylists(signal?: AbortSignal): Promise<UnifiedPlaylist[]> {
    const playlists = await this.client.getAllLibraryPlaylists(signal);
    return playlists.map((p) => toUnifiedPlaylist(p));
  }

  async getPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<UnifiedTrack[]> {
    if (playlistId === 'library-songs') {
      return this.getFavorites(signal);
    }
    const songs = await this.client.getLibraryPlaylistTracks(playlistId, { signal });
    return songs.map(toUnifiedTrack);
  }

  async getFavorites(signal?: AbortSignal): Promise<UnifiedTrack[]> {
    const songs = await this.client.getLibrarySongs({ signal });
    return songs.map(toUnifiedTrack);
  }

  canParseUrl(url: string): boolean {
    return isAppleMusicUrl(url);
  }

  async getPublicPlaylist(
    url: string,
    signal?: AbortSignal
  ): Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }> {
    if (!this.canParseUrl(url)) {
      throw new Error(`Invalid Apple Music playlist URL: ${url}`);
    }

    if (this.publicPlaylistFetcher) {
      return await this.publicPlaylistFetcher(url);
    }

    if (typeof window !== 'undefined') {
      const response = await fetch('/api/apple-music/public-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal,
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(
          errorData.error?.message || `Failed to fetch public playlist (${response.status})`
        );
      }

      const data = (await response.json()) as {
        playlist: UnifiedPlaylist;
        tracks: UnifiedTrack[];
      };
      return data;
    }

    // Direct catalog fetch fallback
    const parsed = parseAppleMusicUrl(url);
    if (!parsed || parsed.type !== 'playlist') {
      throw new Error(`Invalid Apple Music playlist URL: ${url}`);
    }

    const { playlist, tracks } = await this.client.getCatalogPlaylist(
      parsed.storefront,
      parsed.id,
      signal
    );

    return {
      playlist: toUnifiedPlaylist(playlist, tracks.length),
      tracks: tracks.map(toUnifiedTrack),
    };
  }

  async searchByIsrc(isrc: string, signal?: AbortSignal): Promise<DestinationMatchCandidate[]> {
    const songs = await this.client.searchByIsrc(isrc, undefined, signal);
    return songs.map(toDestinationMatchCandidate);
  }

  async searchByQuery(
    query: { title: string; artist?: string },
    signal?: AbortSignal
  ): Promise<DestinationMatchCandidate[]> {
    const q = query.artist ? `${query.title} ${query.artist}` : query.title;
    let songs = await this.client.searchSongs(q, undefined, 20, signal);
    if (songs.length === 0 && query.artist) {
      songs = await this.client.searchSongs(query.title, undefined, 20, signal);
    }
    return songs.map(toDestinationMatchCandidate);
  }

  async createPlaylist(
    name: string,
    trackIds: string[],
    options?: { isPublic?: boolean; description?: string }
  ): Promise<{ id: string; success: boolean }> {
    const trackData: AppleMusicTrackIdentifier[] = trackIds.map((id) => ({ id, type: 'songs' }));
    const initialTracks = trackData.slice(0, 100);
    const remainingTracks = trackData.slice(100);

    const res = await this.client.createLibraryPlaylist(
      name,
      options?.description,
      initialTracks
    );

    if (remainingTracks.length > 0) {
      await this.client.addTracksToLibraryPlaylist(res.id, remainingTracks);
    }

    return res;
  }

  async appendToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    const trackData: AppleMusicTrackIdentifier[] = trackIds.map((id) => ({ id, type: 'songs' }));
    return await this.client.addTracksToLibraryPlaylist(playlistId, trackData);
  }

  async saveFavorites(trackIds: string[]): Promise<{ success: boolean }> {
    for (const trackId of trackIds) {
      await this.client.addSongToLibrary(trackId);
    }
    return { success: true };
  }
}

export const createAppleMusicAdapter = (
  client?: AppleMusicClient,
  publicPlaylistFetcher?: (
    url: string
  ) => Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }>
): AppleMusicAdapter => new AppleMusicAdapter(client, publicPlaylistFetcher);
