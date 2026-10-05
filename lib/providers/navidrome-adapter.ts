import {
  ProviderId,
  UnifiedTrack,
  UnifiedPlaylist,
  DestinationMatchCandidate,
  SourceProvider,
  DestinationProvider,
} from '@/types/provider';
import {
  NavidromeNativeSong,
  NavidromeSong,
  NavidromePlaylist,
} from '@/types/navidrome';
import { NavidromeApiClient } from '@/lib/navidrome/client';

export function toUnifiedTrack(song: NavidromeNativeSong | NavidromeSong): UnifiedTrack {
  const native = song as NavidromeNativeSong;
  const isrcVal = Array.isArray(song.isrc)
    ? song.isrc[0]
    : native.tags?.isrc?.[0] || (song.isrc as unknown as string | undefined);

  return {
    id: song.id,
    title: song.title || '',
    artists: [
      {
        id: native.artistId || undefined,
        name: song.artist || 'Unknown Artist',
      },
    ],
    album: {
      id: native.albumId || undefined,
      name: song.album || '',
      releaseDate: native.year ? String(native.year) : native.date,
    },
    durationMs: Math.round((song.duration || 0) * 1000),
    isrc: isrcVal || undefined,
    provider: 'navidrome',
    raw: song,
  };
}

export function navidromeSongFromUnified(unifiedTrack: UnifiedTrack): NavidromeSong {
  return {
    id: unifiedTrack.id,
    title: unifiedTrack.title,
    artist: unifiedTrack.artists.map((a) => a.name).join(', ') || 'Unknown Artist',
    album: unifiedTrack.album.name || '',
    duration: Math.round((unifiedTrack.durationMs || 0) / 1000),
    isrc: unifiedTrack.isrc ? [unifiedTrack.isrc] : undefined,
  };
}

export function toUnifiedPlaylist(playlist: NavidromePlaylist): UnifiedPlaylist {
  const lowerName = playlist.name.toLowerCase();
  const isLikedSongs = lowerName === 'starred' || lowerName === 'liked songs';

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.comment || '',
    owner: {
      id: 'navidrome',
      displayName: 'Navidrome',
    },
    trackCount: playlist.songCount || 0,
    imageUrl: undefined,
    provider: 'navidrome',
    isPublic: playlist.public ?? false,
    snapshotId: playlist.updatedAt || playlist.createdAt || undefined,
    isImported: false,
    isLikedSongs,
  };
}

export function toDestinationMatchCandidate(
  song: NavidromeNativeSong | NavidromeSong,
): DestinationMatchCandidate {
  const native = song as NavidromeNativeSong;
  const isrcVal = Array.isArray(song.isrc)
    ? song.isrc[0]
    : native.tags?.isrc?.[0] || (song.isrc as unknown as string | undefined);

  return {
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    durationMs: Math.round((song.duration || 0) * 1000),
    isrc: isrcVal || undefined,
    raw: song,
  };
}

export function canParseNavidromeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/playlist[/:]([a-zA-Z0-9_-]+)/i.test(trimmed)) return true;
  if (/^navidrome:\/\/playlist\/([a-zA-Z0-9_-]+)/i.test(trimmed)) return true;
  return false;
}

export function extractNavidromePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/playlist[/:]([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];
  return null;
}

export class NavidromeAdapter implements DestinationProvider, SourceProvider {
  readonly id: ProviderId = 'navidrome';
  readonly name: string = 'Navidrome';

  constructor(private client: NavidromeApiClient) {}

  isAuthenticated(): boolean {
    return this.client.isConnected ? this.client.isConnected() : true;
  }

  isConnected(): boolean {
    return this.isAuthenticated();
  }

  async listPlaylists(signal?: AbortSignal): Promise<UnifiedPlaylist[]> {
    const playlists = await this.client.getPlaylists(signal);
    return playlists.map(toUnifiedPlaylist);
  }

  async getPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<UnifiedTrack[]> {
    const result = await this.client.getSubsonicPlaylist(playlistId, signal);
    return (result.tracks || []).map(toUnifiedTrack);
  }

  async getFavorites(signal?: AbortSignal): Promise<UnifiedTrack[]> {
    const songs = await this.client.getStarred2(signal);
    return (songs || []).map(toUnifiedTrack);
  }

  canParseUrl(url: string): boolean {
    return canParseNavidromeUrl(url);
  }

  async getPublicPlaylist(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }> {
    const playlistId = extractNavidromePlaylistId(url);
    if (!playlistId) {
      throw new Error(`Invalid Navidrome playlist URL: ${url}`);
    }

    const { playlist, tracks } = await this.client.getSubsonicPlaylist(playlistId, signal);
    return {
      playlist: toUnifiedPlaylist(playlist),
      tracks: (tracks || []).map(toUnifiedTrack),
    };
  }

  async searchByIsrc(isrc: string, signal?: AbortSignal): Promise<DestinationMatchCandidate[]> {
    const songs = await this.client.searchByQuery(isrc, undefined, signal);
    const exact = songs.filter((s) => {
      const isrcs = s.tags?.isrc || s.isrc || [];
      return isrcs.some((i) => i.toLowerCase() === isrc.toLowerCase());
    });
    const results = exact.length > 0 ? exact : songs;
    return results.map(toDestinationMatchCandidate);
  }

  async searchByQuery(
    query: { title: string; artist?: string },
    signal?: AbortSignal,
  ): Promise<DestinationMatchCandidate[]> {
    if (query.artist) {
      let songs = await this.client.searchByTitleAndArtist(query.title, query.artist, 50, signal);
      if (songs.length === 0) {
        songs = await this.client.searchByTitle(query.title, 50, signal);
      }
      return songs.map(toDestinationMatchCandidate);
    }

    const songs = await this.client.searchByTitle(query.title, 50, signal);
    return songs.map(toDestinationMatchCandidate);
  }

  async createPlaylist(
    name: string,
    trackIds: string[],
    options?: { isPublic?: boolean; description?: string },
  ): Promise<{ id: string; success: boolean }> {
    const res = await this.client.createPlaylist(name, trackIds, options?.isPublic ?? false);
    return { id: res.id, success: res.success };
  }

  async appendToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    const res = await this.client.updatePlaylist(playlistId, trackIds);
    return { success: res.success };
  }

  async saveFavorites(trackIds: string[]): Promise<{ success: boolean }> {
    const res = await this.client.starSongs(trackIds);
    return { success: res.success };
  }
}

export const createNavidromeAdapter = (client: NavidromeApiClient): NavidromeAdapter =>
  new NavidromeAdapter(client);
