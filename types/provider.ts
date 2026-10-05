export type ProviderId = 'spotify' | 'apple-music' | 'navidrome';

export interface UnifiedTrackArtist {
  id?: string;
  name: string;
}

export interface UnifiedTrackAlbum {
  id?: string;
  name: string;
  releaseDate?: string;
}

export interface UnifiedTrack {
  id: string;
  title: string;
  artists: UnifiedTrackArtist[];
  album: UnifiedTrackAlbum;
  durationMs: number;
  isrc?: string;
  provider: ProviderId;
  uri?: string;
  raw?: unknown;
}

export interface UnifiedPlaylistOwner {
  id: string;
  displayName: string;
}

export interface UnifiedPlaylist {
  id: string;
  name: string;
  description: string;
  owner: UnifiedPlaylistOwner;
  trackCount: number;
  imageUrl?: string;
  provider: ProviderId;
  isPublic?: boolean;
  snapshotId?: string;
  isImported?: boolean;
  isLikedSongs?: boolean;
}

export interface DestinationMatchCandidate {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  isrc?: string;
  raw?: unknown;
}

export interface SourceProvider {
  id: ProviderId;
  name: string;
  isAuthenticated(): boolean;
  isConnected(): boolean;
  listPlaylists(signal?: AbortSignal): Promise<UnifiedPlaylist[]>;
  getPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<UnifiedTrack[]>;
  getFavorites(signal?: AbortSignal): Promise<UnifiedTrack[]>;
  canParseUrl(url: string): boolean;
  getPublicPlaylist(url: string, signal?: AbortSignal): Promise<{ playlist: UnifiedPlaylist; tracks: UnifiedTrack[] }>;
}

export interface DestinationProvider {
  id: ProviderId;
  name: string;
  isConnected(): boolean;
  isAuthenticated(): boolean;
  searchByIsrc(isrc: string, signal?: AbortSignal): Promise<DestinationMatchCandidate[]>;
  searchByQuery(query: { title: string; artist?: string }, signal?: AbortSignal): Promise<DestinationMatchCandidate[]>;
  createPlaylist(
    name: string,
    trackIds: string[],
    options?: { isPublic?: boolean; description?: string }
  ): Promise<{ id: string; success: boolean }>;
  appendToPlaylist(playlistId: string, trackIds: string[]): Promise<{ success: boolean }>;
  saveFavorites(trackIds: string[]): Promise<{ success: boolean }>;
}
