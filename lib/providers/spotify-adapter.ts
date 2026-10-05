import {
  ProviderId,
  UnifiedTrack,
  UnifiedTrackArtist,
  UnifiedTrackAlbum,
  UnifiedPlaylist,
  DestinationMatchCandidate,
  SourceProvider,
  DestinationProvider,
} from '@/types/provider';
import { SpotifyTrack, SpotifyPlaylist } from '@/types/spotify';
import { ImportedPlaylist } from '@/types/public-playlist';
import { SpotifyClient, spotifyClient } from '@/lib/spotify/client';

export function toUnifiedTrack(spotifyTrack: SpotifyTrack): UnifiedTrack {
  const isrc = spotifyTrack.external_ids?.isrc;
  const artists: UnifiedTrackArtist[] = (spotifyTrack.artists || []).map((a) => ({
    id: a.id ?? undefined,
    name: a.name || 'Unknown Artist',
  }));
  const album: UnifiedTrackAlbum = {
    id: spotifyTrack.album?.id ?? undefined,
    name: spotifyTrack.album?.name || '',
    releaseDate: spotifyTrack.album?.release_date,
  };

  return {
    id: spotifyTrack.id || (spotifyTrack.uri ? spotifyTrack.uri.replace(/^spotify:track:/, '') : ''),
    title: spotifyTrack.name || '',
    artists,
    album,
    durationMs: spotifyTrack.duration_ms || 0,
    isrc: isrc || undefined,
    provider: 'spotify',
    uri: spotifyTrack.uri || (spotifyTrack.id ? `spotify:track:${spotifyTrack.id}` : undefined),
    raw: spotifyTrack,
  };
}

export function spotifyTrackFromUnified(unifiedTrack: UnifiedTrack): SpotifyTrack {
  const id = unifiedTrack.id || null;
  const artists = (unifiedTrack.artists || []).map((a) => ({
    id: a.id ?? null,
    name: a.name,
  }));
  const album = {
    id: unifiedTrack.album?.id ?? null,
    name: unifiedTrack.album?.name || '',
    release_date: unifiedTrack.album?.releaseDate,
  };

  return {
    id,
    name: unifiedTrack.title,
    uri: unifiedTrack.uri || (id ? `spotify:track:${id}` : undefined),
    is_local: false,
    artists,
    album,
    duration_ms: unifiedTrack.durationMs,
    external_ids: unifiedTrack.isrc ? { isrc: unifiedTrack.isrc } : {},
    external_urls: id ? { spotify: `https://open.spotify.com/track/${id}` } : undefined,
  };
}

export function toUnifiedPlaylist(
  playlist: SpotifyPlaylist | ImportedPlaylist,
): UnifiedPlaylist {
  const isImported = 'nullTrackCount' in playlist;

  if (isImported) {
    const imp = playlist as ImportedPlaylist;
    const ownerName = typeof imp.owner === 'string' ? imp.owner : (imp.owner as { display_name?: string })?.display_name || '';
    return {
      id: imp.id,
      name: imp.name,
      description: '',
      owner: {
        id: ownerName,
        displayName: ownerName,
      },
      trackCount: imp.trackCount ?? imp.tracks?.length ?? 0,
      imageUrl: imp.imageUrl,
      provider: 'spotify',
      isPublic: true,
      snapshotId: imp.sourceRevision,
      isImported: true,
      isLikedSongs: imp.id === 'liked-songs',
    };
  }

  const sp = playlist as SpotifyPlaylist;
  return {
    id: sp.id,
    name: sp.name,
    description: sp.description || '',
    owner: {
      id: sp.owner?.id || '',
      displayName: sp.owner?.display_name || sp.owner?.id || '',
    },
    trackCount: sp.items?.total ?? (sp as unknown as { tracks?: { total?: number } }).tracks?.total ?? (sp as unknown as { trackCount?: number }).trackCount ?? 0,
    imageUrl: sp.images?.[0]?.url,
    provider: 'spotify',
    isPublic: sp.public ?? undefined,
    snapshotId: sp.snapshot_id,
    isImported: false,
    isLikedSongs: sp.id === 'liked-songs',
  };
}

export function toDestinationMatchCandidate(track: SpotifyTrack): DestinationMatchCandidate {
  return {
    id: track.id || '',
    title: track.name,
    artist: track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist',
    album: track.album?.name || '',
    durationMs: track.duration_ms,
    isrc: track.external_ids?.isrc,
    raw: track,
  };
}

export function canParseSpotifyUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('apple.com')) return false;
  if (/playlist\/([A-Za-z0-9]{22})/.test(trimmed)) return true;
  if (/^spotify:playlist:([A-Za-z0-9]{22})$/.test(trimmed)) return true;
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return true;
  return false;
}

export class SpotifyAdapter implements SourceProvider, DestinationProvider {
  readonly id: ProviderId = 'spotify';
  readonly name: string = 'Spotify';

  constructor(
    private client: SpotifyClient = spotifyClient,
    private publicPlaylistFetcher?: (playlistId: string) => Promise<ImportedPlaylist>,
  ) {}

  isAuthenticated(): boolean {
    return this.client.isAuthenticated();
  }

  isConnected(): boolean {
    return this.isAuthenticated();
  }

  async listPlaylists(signal?: AbortSignal): Promise<UnifiedPlaylist[]> {
    const playlists = await this.client.getAllPlaylists(signal);
    return playlists.map(toUnifiedPlaylist);
  }

  async getPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<UnifiedTrack[]> {
    if (playlistId === 'liked-songs') {
      return this.getFavorites(signal);
    }
    const items = await this.client.getAllPlaylistTracks(playlistId, signal);
    return items
      .filter((item) => item.track != null)
      .map((item) => toUnifiedTrack(item.track!));
  }

  async getFavorites(signal?: AbortSignal): Promise<UnifiedTrack[]> {
    const items = await this.client.getAllSavedTracks(signal);
    return items
      .filter((item) => item.track != null)
      .map((item) => toUnifiedTrack(item.track));
  }

  canParseUrl(url: string): boolean {
    return canParseSpotifyUrl(url);
  }

  async getPublicPlaylist(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }> {
    const playlistId = this.extractPlaylistId(url);
    if (!playlistId) {
      throw new Error(`Invalid Spotify playlist URL: ${url}`);
    }

    let imported: ImportedPlaylist;
    if (this.publicPlaylistFetcher) {
      imported = await this.publicPlaylistFetcher(playlistId);
    } else if (typeof window !== 'undefined') {
      const response = await fetch('/api/spotify/public-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal,
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `Failed to fetch public playlist (${response.status})`);
      }
      const data = (await response.json()) as { playlist: ImportedPlaylist };
      imported = data.playlist;
    } else {
      const { getPublicPlaylist } = await import('@/lib/spotify/public-client');
      imported = await getPublicPlaylist(playlistId);
    }

    return {
      playlist: toUnifiedPlaylist(imported),
      tracks: (imported.tracks || []).map(toUnifiedTrack),
    };
  }

  private extractPlaylistId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/playlist\/([A-Za-z0-9]{22})/);
    if (match) return match[1];
    const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]{22})$/);
    if (uriMatch) return uriMatch[1];
    if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
    return null;
  }

  async searchByIsrc(isrc: string, signal?: AbortSignal): Promise<DestinationMatchCandidate[]> {
    const res = await this.client.search(`isrc:${isrc}`, 'track', 10, signal);
    const tracks = res.tracks?.items || [];
    return tracks.map(toDestinationMatchCandidate);
  }

  async searchByQuery(
    query: { title: string; artist?: string },
    signal?: AbortSignal,
  ): Promise<DestinationMatchCandidate[]> {
    const q = query.artist ? `track:${query.title} artist:${query.artist}` : `track:${query.title}`;
    let res = await this.client.search(q, 'track', 20, signal);
    let tracks = res.tracks?.items || [];
    if (tracks.length === 0 && query.artist) {
      res = await this.client.search(`${query.title} ${query.artist}`, 'track', 20, signal);
      tracks = res.tracks?.items || [];
    }
    return tracks.map(toDestinationMatchCandidate);
  }

  async createPlaylist(
    name: string,
    trackIds: string[],
    options?: { isPublic?: boolean; description?: string },
  ): Promise<{ id: string; success: boolean }> {
    const playlist = await this.client.createPlaylist(name, options);
    if (trackIds.length > 0) {
      await this.appendToPlaylist(playlist.id, trackIds);
    }
    return { id: playlist.id, success: true };
  }

  async appendToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }> {
    await this.client.addTracksToPlaylist(playlistId, trackIds);
    return { success: true };
  }

  async saveFavorites(trackIds: string[]): Promise<{ success: boolean }> {
    await this.client.saveTracks(trackIds);
    return { success: true };
  }
}

export const createSpotifyAdapter = (
  client?: SpotifyClient,
  publicPlaylistFetcher?: (playlistId: string) => Promise<ImportedPlaylist>,
): SpotifyAdapter => new SpotifyAdapter(client, publicPlaylistFetcher);
