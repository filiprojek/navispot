import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SpotifyAdapter,
  toUnifiedTrack as spotifyToUnifiedTrack,
  spotifyTrackFromUnified,
  toUnifiedPlaylist as spotifyToUnifiedPlaylist,
  toDestinationMatchCandidate as spotifyToDestinationCandidate,
  canParseSpotifyUrl,
} from './spotify-adapter';
import {
  NavidromeAdapter,
  toUnifiedTrack as navidromeToUnifiedTrack,
  navidromeSongFromUnified,
  toUnifiedPlaylist as navidromeToUnifiedPlaylist,
  toDestinationMatchCandidate as navidromeToDestinationCandidate,
  canParseNavidromeUrl,
} from './navidrome-adapter';
import { SpotifyTrack, SpotifyPlaylist } from '@/types/spotify';
import { ImportedPlaylist } from '@/types/public-playlist';
import { NavidromeNativeSong, NavidromeSong, NavidromePlaylist } from '@/types/navidrome';
import { SpotifyClient } from '@/lib/spotify/client';
import { NavidromeApiClient } from '@/lib/navidrome/client';

describe('Spotify Data Conversions', () => {
  const sampleSpotifyTrack: SpotifyTrack = {
    id: 'track123',
    name: 'Bohemian Rhapsody',
    uri: 'spotify:track:track123',
    is_local: false,
    artists: [
      { id: 'artist1', name: 'Queen' },
      { id: 'artist2', name: 'Freddie Mercury' },
    ],
    album: {
      id: 'album1',
      name: 'A Night at the Opera',
      release_date: '1975-11-21',
    },
    duration_ms: 354000,
    external_ids: { isrc: 'GBUM71029606' },
    external_urls: { spotify: 'https://open.spotify.com/track/track123' },
  };

  it('converts SpotifyTrack to UnifiedTrack correctly', () => {
    const unified = spotifyToUnifiedTrack(sampleSpotifyTrack);

    expect(unified.id).toBe('track123');
    expect(unified.title).toBe('Bohemian Rhapsody');
    expect(unified.artists).toEqual([
      { id: 'artist1', name: 'Queen' },
      { id: 'artist2', name: 'Freddie Mercury' },
    ]);
    expect(unified.album).toEqual({
      id: 'album1',
      name: 'A Night at the Opera',
      releaseDate: '1975-11-21',
    });
    expect(unified.durationMs).toBe(354000);
    expect(unified.isrc).toBe('GBUM71029606');
    expect(unified.provider).toBe('spotify');
    expect(unified.uri).toBe('spotify:track:track123');
    expect(unified.raw).toBe(sampleSpotifyTrack);
  });

  it('handles tracks with missing optional fields in toUnifiedTrack', () => {
    const minimalTrack: SpotifyTrack = {
      id: null,
      name: 'Minimal Song',
      uri: 'spotify:track:mini456',
      artists: [],
      album: { id: null, name: '' },
      duration_ms: 120000,
      external_ids: {},
    };

    const unified = spotifyToUnifiedTrack(minimalTrack);
    expect(unified.id).toBe('mini456');
    expect(unified.title).toBe('Minimal Song');
    expect(unified.artists).toEqual([]);
    expect(unified.album.name).toBe('');
    expect(unified.album.id).toBeUndefined();
    expect(unified.album.releaseDate).toBeUndefined();
    expect(unified.isrc).toBeUndefined();
  });

  it('performs bidirectional conversion: SpotifyTrack -> UnifiedTrack -> SpotifyTrack', () => {
    const unified = spotifyToUnifiedTrack(sampleSpotifyTrack);
    const convertedBack = spotifyTrackFromUnified(unified);

    expect(convertedBack.id).toBe(sampleSpotifyTrack.id);
    expect(convertedBack.name).toBe(sampleSpotifyTrack.name);
    expect(convertedBack.uri).toBe(sampleSpotifyTrack.uri);
    expect(convertedBack.duration_ms).toBe(sampleSpotifyTrack.duration_ms);
    expect(convertedBack.external_ids.isrc).toBe(sampleSpotifyTrack.external_ids.isrc);
    expect(convertedBack.artists).toEqual(sampleSpotifyTrack.artists);
    expect(convertedBack.album.name).toBe(sampleSpotifyTrack.album.name);
    expect(convertedBack.album.release_date).toBe(sampleSpotifyTrack.album.release_date);
  });

  it('converts SpotifyPlaylist to UnifiedPlaylist correctly', () => {
    const spotifyPlaylist: SpotifyPlaylist = {
      id: 'pl-classic-rock',
      name: 'Classic Rock Anthems',
      description: 'The greatest songs',
      images: [{ url: 'https://images.spotify.com/rock.jpg' }],
      owner: { id: 'user-rock', display_name: 'Rock Fan' },
      items: { total: 42 },
      snapshot_id: 'snap123',
      public: true,
    };

    const unified = spotifyToUnifiedPlaylist(spotifyPlaylist);
    expect(unified.id).toBe('pl-classic-rock');
    expect(unified.name).toBe('Classic Rock Anthems');
    expect(unified.description).toBe('The greatest songs');
    expect(unified.owner).toEqual({ id: 'user-rock', displayName: 'Rock Fan' });
    expect(unified.trackCount).toBe(42);
    expect(unified.imageUrl).toBe('https://images.spotify.com/rock.jpg');
    expect(unified.provider).toBe('spotify');
    expect(unified.isPublic).toBe(true);
    expect(unified.snapshotId).toBe('snap123');
    expect(unified.isImported).toBe(false);
    expect(unified.isLikedSongs).toBe(false);
  });

  it('identifies liked songs playlist in spotifyToUnifiedPlaylist', () => {
    const likedPlaylist: SpotifyPlaylist = {
      id: 'liked-songs',
      name: 'Liked Songs',
      description: 'Your favorites',
      images: [],
      owner: { id: 'me', display_name: 'Me' },
      items: { total: 100 },
      snapshot_id: 'snap-liked',
      public: false,
    };

    const unified = spotifyToUnifiedPlaylist(likedPlaylist);
    expect(unified.isLikedSongs).toBe(true);
  });

  it('converts ImportedPlaylist to UnifiedPlaylist correctly', () => {
    const imported: ImportedPlaylist = {
      id: '37i9dQZF1DXcBWIGoYBM5M',
      name: "Today's Top Hits",
      owner: 'Spotify',
      trackCount: 50,
      imageUrl: 'https://i.scdn.co/image/ab67706f00000002.jpg',
      tracks: [sampleSpotifyTrack],
      entries: [],
      sourceRevision: 'snap-top-hits',
      nullTrackCount: 0,
      importedAt: '2026-10-05T00:00:00Z',
    };

    const unified = spotifyToUnifiedPlaylist(imported);
    expect(unified.id).toBe('37i9dQZF1DXcBWIGoYBM5M');
    expect(unified.name).toBe("Today's Top Hits");
    expect(unified.owner).toEqual({ id: 'Spotify', displayName: 'Spotify' });
    expect(unified.trackCount).toBe(50);
    expect(unified.imageUrl).toBe('https://i.scdn.co/image/ab67706f00000002.jpg');
    expect(unified.provider).toBe('spotify');
    expect(unified.isImported).toBe(true);
    expect(unified.snapshotId).toBe('snap-top-hits');
  });

  it('converts SpotifyTrack to DestinationMatchCandidate correctly', () => {
    const candidate = spotifyToDestinationCandidate(sampleSpotifyTrack);
    expect(candidate.id).toBe('track123');
    expect(candidate.title).toBe('Bohemian Rhapsody');
    expect(candidate.artist).toBe('Queen, Freddie Mercury');
    expect(candidate.album).toBe('A Night at the Opera');
    expect(candidate.durationMs).toBe(354000);
    expect(candidate.isrc).toBe('GBUM71029606');
    expect(candidate.raw).toBe(sampleSpotifyTrack);
  });
});

describe('Navidrome Data Conversions', () => {
  const sampleNativeSong: NavidromeNativeSong = {
    id: 'song-nd-1',
    title: 'Hotel California',
    artist: 'Eagles',
    artistId: 'artist-eagles',
    album: 'Hotel California (Deluxe Edition)',
    albumId: 'album-hc',
    duration: 391, // seconds
    year: 1976,
    tags: {
      isrc: ['USPR37600005'],
    },
  };

  const sampleSimpleSong: NavidromeSong = {
    id: 'song-nd-2',
    title: 'Take It Easy',
    artist: 'Eagles',
    album: 'Eagles',
    duration: 211,
    isrc: ['USPR37200001'],
  };

  it('converts NavidromeNativeSong to UnifiedTrack with duration in ms', () => {
    const unified = navidromeToUnifiedTrack(sampleNativeSong);

    expect(unified.id).toBe('song-nd-1');
    expect(unified.title).toBe('Hotel California');
    expect(unified.artists).toEqual([{ id: 'artist-eagles', name: 'Eagles' }]);
    expect(unified.album).toEqual({
      id: 'album-hc',
      name: 'Hotel California (Deluxe Edition)',
      releaseDate: '1976',
    });
    expect(unified.durationMs).toBe(391000); // 391 * 1000
    expect(unified.isrc).toBe('USPR37600005');
    expect(unified.provider).toBe('navidrome');
    expect(unified.raw).toBe(sampleNativeSong);
  });

  it('converts NavidromeSong to UnifiedTrack correctly', () => {
    const unified = navidromeToUnifiedTrack(sampleSimpleSong);

    expect(unified.id).toBe('song-nd-2');
    expect(unified.title).toBe('Take It Easy');
    expect(unified.artists).toEqual([{ id: undefined, name: 'Eagles' }]);
    expect(unified.album.name).toBe('Eagles');
    expect(unified.durationMs).toBe(211000);
    expect(unified.isrc).toBe('USPR37200001');
    expect(unified.provider).toBe('navidrome');
  });

  it('converts UnifiedTrack back to NavidromeSong bidirectionally', () => {
    const unified = navidromeToUnifiedTrack(sampleSimpleSong);
    const converted = navidromeSongFromUnified(unified);

    expect(converted.id).toBe(sampleSimpleSong.id);
    expect(converted.title).toBe(sampleSimpleSong.title);
    expect(converted.artist).toBe(sampleSimpleSong.artist);
    expect(converted.album).toBe(sampleSimpleSong.album);
    expect(converted.duration).toBe(sampleSimpleSong.duration);
    expect(converted.isrc).toEqual(sampleSimpleSong.isrc);
  });

  it('converts NavidromePlaylist to UnifiedPlaylist correctly', () => {
    const ndPlaylist: NavidromePlaylist = {
      id: 'pl-nd-100',
      name: 'Road Trip 2026',
      comment: 'Best songs for long drives',
      songCount: 88,
      duration: 19800,
      createdAt: '2026-05-01T10:00:00Z',
      updatedAt: '2026-05-02T12:00:00Z',
      public: true,
    };

    const unified = navidromeToUnifiedPlaylist(ndPlaylist);
    expect(unified.id).toBe('pl-nd-100');
    expect(unified.name).toBe('Road Trip 2026');
    expect(unified.description).toBe('Best songs for long drives');
    expect(unified.owner).toEqual({ id: 'navidrome', displayName: 'Navidrome' });
    expect(unified.trackCount).toBe(88);
    expect(unified.provider).toBe('navidrome');
    expect(unified.isPublic).toBe(true);
    expect(unified.snapshotId).toBe('2026-05-02T12:00:00Z');
    expect(unified.isLikedSongs).toBe(false);
  });

  it('identifies Starred and Liked Songs playlists for Navidrome', () => {
    const starredPlaylist: NavidromePlaylist = {
      id: 'starred',
      name: 'Starred',
      songCount: 15,
      duration: 3600,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(navidromeToUnifiedPlaylist(starredPlaylist).isLikedSongs).toBe(true);

    const likedPlaylist: NavidromePlaylist = {
      id: 'liked',
      name: 'Liked Songs',
      songCount: 20,
      duration: 4000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    expect(navidromeToUnifiedPlaylist(likedPlaylist).isLikedSongs).toBe(true);
  });

  it('converts Navidrome song to DestinationMatchCandidate with durationMs', () => {
    const candidate = navidromeToDestinationCandidate(sampleNativeSong);
    expect(candidate.id).toBe('song-nd-1');
    expect(candidate.title).toBe('Hotel California');
    expect(candidate.artist).toBe('Eagles');
    expect(candidate.album).toBe('Hotel California (Deluxe Edition)');
    expect(candidate.durationMs).toBe(391000);
    expect(candidate.isrc).toBe('USPR37600005');
  });
});

describe('Spotify URL Parsing', () => {
  it('identifies valid Spotify playlist URLs', () => {
    expect(canParseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(canParseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abcdef1234567890')).toBe(true);
    expect(canParseSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(canParseSpotifyUrl('37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
  });

  it('rejects invalid or non-Spotify URLs', () => {
    expect(canParseSpotifyUrl('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb')).toBe(false);
    expect(canParseSpotifyUrl('https://google.com')).toBe(false);
    expect(canParseSpotifyUrl('')).toBe(false);
  });
});

describe('Navidrome URL Parsing', () => {
  it('identifies valid Navidrome playlist URLs', () => {
    expect(canParseNavidromeUrl('http://localhost:4533/#/playlist/pl-123')).toBe(true);
    expect(canParseNavidromeUrl('https://music.myserver.com/playlist/abc-987')).toBe(true);
    expect(canParseNavidromeUrl('navidrome://playlist/pl-xyz')).toBe(true);
  });

  it('rejects invalid URLs', () => {
    expect(canParseNavidromeUrl('https://google.com')).toBe(false);
    expect(canParseNavidromeUrl('')).toBe(false);
  });
});

describe('SpotifyAdapter (Source & Destination Provider)', () => {
  let mockClient: SpotifyClient;
  let adapter: SpotifyAdapter;

  const mockTrack: SpotifyTrack = {
    id: 'track-001',
    name: 'Stairway to Heaven',
    uri: 'spotify:track:track-001',
    is_local: false,
    artists: [{ id: 'art-1', name: 'Led Zeppelin' }],
    album: { id: 'alb-1', name: 'Led Zeppelin IV' },
    duration_ms: 482000,
    external_ids: { isrc: 'USAT20700030' },
  };

  const mockPlaylist: SpotifyPlaylist = {
    id: 'pl-001',
    name: 'Rock Classics',
    description: 'Best classic rock tracks',
    images: [{ url: 'https://img.spotify.com/pl.jpg' }],
    owner: { id: 'user-01', display_name: 'Classic DJ' },
    items: { total: 1 },
    snapshot_id: 'snap-001',
    public: true,
  };

  beforeEach(() => {
    mockClient = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      getAllPlaylists: vi.fn().mockResolvedValue([mockPlaylist]),
      getAllPlaylistTracks: vi.fn().mockResolvedValue([{ track: mockTrack, added_at: '2026-01-01T00:00:00Z' }]),
      getAllSavedTracks: vi.fn().mockResolvedValue([{ track: mockTrack, added_at: '2026-01-01T00:00:00Z' }]),
      search: vi.fn().mockResolvedValue({ tracks: { items: [mockTrack], total: 1 } }),
      createPlaylist: vi.fn().mockResolvedValue({ id: 'new-pl-123', name: 'New Playlist' }),
      addTracksToPlaylist: vi.fn().mockResolvedValue({ snapshot_id: 'snap-new' }),
      saveTracks: vi.fn().mockResolvedValue(undefined),
    } as unknown as SpotifyClient;

    adapter = new SpotifyAdapter(mockClient);
  });

  it('checks authentication status', () => {
    expect(adapter.isAuthenticated()).toBe(true);
    expect(adapter.isConnected()).toBe(true);

    vi.mocked(mockClient.isAuthenticated).mockReturnValue(false);
    expect(adapter.isAuthenticated()).toBe(false);
    expect(adapter.isConnected()).toBe(false);
  });

  it('lists playlists and converts them to UnifiedPlaylist[]', async () => {
    const playlists = await adapter.listPlaylists();
    expect(playlists).toHaveLength(1);
    expect(playlists[0].id).toBe('pl-001');
    expect(playlists[0].name).toBe('Rock Classics');
    expect(playlists[0].provider).toBe('spotify');
  });

  it('fetches playlist tracks and filters null tracks', async () => {
    vi.mocked(mockClient.getAllPlaylistTracks).mockResolvedValue([
      { track: mockTrack, added_at: '2026-01-01T00:00:00Z' },
      { track: null, added_at: '2026-01-01T00:00:00Z' },
    ]);

    const tracks = await adapter.getPlaylistTracks('pl-001');
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track-001');
    expect(tracks[0].title).toBe('Stairway to Heaven');
    expect(tracks[0].provider).toBe('spotify');
  });

  it('delegates liked-songs to getFavorites in getPlaylistTracks', async () => {
    const tracks = await adapter.getPlaylistTracks('liked-songs');
    expect(mockClient.getAllSavedTracks).toHaveBeenCalled();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track-001');
  });

  it('fetches saved tracks via getFavorites', async () => {
    const tracks = await adapter.getFavorites();
    expect(mockClient.getAllSavedTracks).toHaveBeenCalled();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('track-001');
  });

  it('fetches public playlist with custom fetcher', async () => {
    const mockImported: ImportedPlaylist = {
      id: '37i9dQZF1DXcBWIGoYBM5M',
      name: 'Public Rock',
      owner: 'Spotify',
      trackCount: 1,
      tracks: [mockTrack],
      entries: [],
      nullTrackCount: 0,
      importedAt: '2026-10-05T00:00:00Z',
    };

    const customFetcher = vi.fn().mockResolvedValue(mockImported);
    const customAdapter = new SpotifyAdapter(mockClient, customFetcher);

    const result = await customAdapter.getPublicPlaylist(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );

    expect(customFetcher).toHaveBeenCalledWith('37i9dQZF1DXcBWIGoYBM5M');
    expect(result.playlist.id).toBe('37i9dQZF1DXcBWIGoYBM5M');
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].title).toBe('Stairway to Heaven');
  });

  it('throws when getPublicPlaylist receives an invalid URL', async () => {
    await expect(adapter.getPublicPlaylist('https://invalid-url.com')).rejects.toThrow(
      'Invalid Spotify playlist URL',
    );
  });

  it('searches destination candidates by ISRC', async () => {
    const candidates = await adapter.searchByIsrc('USAT20700030');
    expect(mockClient.search).toHaveBeenCalledWith('isrc:USAT20700030', 'track', 10, undefined);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('track-001');
    expect(candidates[0].isrc).toBe('USAT20700030');
  });

  it('searches destination candidates by title and artist', async () => {
    const candidates = await adapter.searchByQuery({
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
    });
    expect(mockClient.search).toHaveBeenCalledWith(
      'track:Stairway to Heaven artist:Led Zeppelin',
      'track',
      20,
      undefined,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Stairway to Heaven');
  });

  it('falls back to plain query if field-filtered query returns empty', async () => {
    vi.mocked(mockClient.search)
      .mockResolvedValueOnce({ tracks: { items: [], total: 0 } })
      .mockResolvedValueOnce({ tracks: { items: [mockTrack], total: 1 } });

    const candidates = await adapter.searchByQuery({
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
    });

    expect(mockClient.search).toHaveBeenNthCalledWith(
      1,
      'track:Stairway to Heaven artist:Led Zeppelin',
      'track',
      20,
      undefined,
    );
    expect(mockClient.search).toHaveBeenNthCalledWith(
      2,
      'Stairway to Heaven Led Zeppelin',
      'track',
      20,
      undefined,
    );
    expect(candidates).toHaveLength(1);
  });

  it('creates playlist and appends tracks', async () => {
    const result = await adapter.createPlaylist('My Rock Playlist', ['track-001', 'track-002'], {
      isPublic: true,
      description: 'Awesome songs',
    });

    expect(mockClient.createPlaylist).toHaveBeenCalledWith('My Rock Playlist', {
      isPublic: true,
      description: 'Awesome songs',
    });
    expect(mockClient.addTracksToPlaylist).toHaveBeenCalledWith('new-pl-123', [
      'track-001',
      'track-002',
    ]);
    expect(result).toEqual({ id: 'new-pl-123', success: true });
  });

  it('appends tracks to existing playlist', async () => {
    const result = await adapter.appendToPlaylist('pl-existing', ['track-001']);
    expect(mockClient.addTracksToPlaylist).toHaveBeenCalledWith('pl-existing', ['track-001']);
    expect(result).toEqual({ success: true });
  });

  it('saves favorites', async () => {
    const result = await adapter.saveFavorites(['track-001', 'track-002']);
    expect(mockClient.saveTracks).toHaveBeenCalledWith(['track-001', 'track-002']);
    expect(result).toEqual({ success: true });
  });
});

describe('NavidromeAdapter (Source & Destination Provider)', () => {
  let mockClient: NavidromeApiClient;
  let adapter: NavidromeAdapter;

  const mockSong: NavidromeNativeSong = {
    id: 'nd-song-77',
    title: 'Comfortably Numb',
    artist: 'Pink Floyd',
    artistId: 'pf-id',
    album: 'The Wall',
    albumId: 'wall-id',
    duration: 382,
    year: 1979,
    tags: {
      isrc: ['GBAYE7900139'],
    },
  };

  const mockPlaylist: NavidromePlaylist = {
    id: 'nd-pl-1',
    name: 'Progressive Rock',
    comment: 'Classic prog',
    songCount: 1,
    duration: 382,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-02T00:00:00Z',
    public: true,
  };

  beforeEach(() => {
    mockClient = {
      isConnected: vi.fn().mockReturnValue(true),
      getPlaylists: vi.fn().mockResolvedValue([mockPlaylist]),
      getSubsonicPlaylist: vi.fn().mockResolvedValue({
        playlist: mockPlaylist,
        tracks: [mockSong],
      }),
      getStarred2: vi.fn().mockResolvedValue([mockSong]),
      searchByQuery: vi.fn().mockResolvedValue([mockSong]),
      searchByTitleAndArtist: vi.fn().mockResolvedValue([mockSong]),
      searchByTitle: vi.fn().mockResolvedValue([mockSong]),
      createPlaylist: vi.fn().mockResolvedValue({ id: 'created-nd-pl', success: true }),
      updatePlaylist: vi.fn().mockResolvedValue({ success: true }),
      starSongs: vi.fn().mockResolvedValue({ success: true, processed: 1 }),
    } as unknown as NavidromeApiClient;

    adapter = new NavidromeAdapter(mockClient);
  });

  it('checks connection / authentication status', () => {
    expect(adapter.isAuthenticated()).toBe(true);
    expect(adapter.isConnected()).toBe(true);

    vi.mocked(mockClient.isConnected).mockReturnValue(false);
    expect(adapter.isAuthenticated()).toBe(false);
    expect(adapter.isConnected()).toBe(false);
  });

  it('lists playlists and maps to UnifiedPlaylist[]', async () => {
    const playlists = await adapter.listPlaylists();
    expect(playlists).toHaveLength(1);
    expect(playlists[0].id).toBe('nd-pl-1');
    expect(playlists[0].name).toBe('Progressive Rock');
    expect(playlists[0].provider).toBe('navidrome');
  });

  it('gets playlist tracks via Subsonic getPlaylist', async () => {
    const tracks = await adapter.getPlaylistTracks('nd-pl-1');
    expect(mockClient.getSubsonicPlaylist).toHaveBeenCalledWith('nd-pl-1', undefined);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe('nd-song-77');
    expect(tracks[0].title).toBe('Comfortably Numb');
    expect(tracks[0].durationMs).toBe(382000);
    expect(tracks[0].isrc).toBe('GBAYE7900139');
    expect(tracks[0].provider).toBe('navidrome');
  });

  it('gets favorites via Subsonic getStarred2', async () => {
    const favorites = await adapter.getFavorites();
    expect(mockClient.getStarred2).toHaveBeenCalled();
    expect(favorites).toHaveLength(1);
    expect(favorites[0].id).toBe('nd-song-77');
    expect(favorites[0].title).toBe('Comfortably Numb');
  });

  it('fetches public playlist from Navidrome URL', async () => {
    const result = await adapter.getPublicPlaylist('http://localhost:4533/#/playlist/nd-pl-1');
    expect(mockClient.getSubsonicPlaylist).toHaveBeenCalledWith('nd-pl-1', undefined);
    expect(result.playlist.id).toBe('nd-pl-1');
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0].title).toBe('Comfortably Numb');
  });

  it('throws on invalid Navidrome URL in getPublicPlaylist', async () => {
    await expect(adapter.getPublicPlaylist('http://localhost:4533/other/path')).rejects.toThrow(
      'Invalid Navidrome playlist URL',
    );
  });

  it('searches by ISRC and matches candidate', async () => {
    const candidates = await adapter.searchByIsrc('GBAYE7900139');
    expect(mockClient.searchByQuery).toHaveBeenCalledWith('GBAYE7900139', undefined, undefined);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe('nd-song-77');
    expect(candidates[0].isrc).toBe('GBAYE7900139');
    expect(candidates[0].durationMs).toBe(382000);
  });

  it('searches by query with title and artist', async () => {
    const candidates = await adapter.searchByQuery({
      title: 'Comfortably Numb',
      artist: 'Pink Floyd',
    });
    expect(mockClient.searchByTitleAndArtist).toHaveBeenCalledWith(
      'Comfortably Numb',
      'Pink Floyd',
      50,
      undefined,
    );
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).toBe('Comfortably Numb');
  });

  it('falls back to searchByTitle when searchByTitleAndArtist returns 0 results', async () => {
    vi.mocked(mockClient.searchByTitleAndArtist).mockResolvedValueOnce([]);
    const candidates = await adapter.searchByQuery({
      title: 'Comfortably Numb',
      artist: 'Pink Floyd',
    });
    expect(mockClient.searchByTitle).toHaveBeenCalledWith('Comfortably Numb', 50, undefined);
    expect(candidates).toHaveLength(1);
  });

  it('searches by query with title only', async () => {
    const candidates = await adapter.searchByQuery({
      title: 'Comfortably Numb',
    });
    expect(mockClient.searchByTitle).toHaveBeenCalledWith('Comfortably Numb', 50, undefined);
    expect(candidates).toHaveLength(1);
  });

  it('creates playlist in Navidrome', async () => {
    const result = await adapter.createPlaylist('Prog Rock', ['nd-song-77'], { isPublic: true });
    expect(mockClient.createPlaylist).toHaveBeenCalledWith('Prog Rock', ['nd-song-77'], true);
    expect(result).toEqual({ id: 'created-nd-pl', success: true });
  });

  it('appends tracks to Navidrome playlist', async () => {
    const result = await adapter.appendToPlaylist('nd-pl-1', ['nd-song-77']);
    expect(mockClient.updatePlaylist).toHaveBeenCalledWith('nd-pl-1', ['nd-song-77']);
    expect(result).toEqual({ success: true });
  });

  it('saves favorites (starring songs) in Navidrome', async () => {
    const result = await adapter.saveFavorites(['nd-song-77']);
    expect(mockClient.starSongs).toHaveBeenCalledWith(['nd-song-77']);
    expect(result).toEqual({ success: true });
  });
});
