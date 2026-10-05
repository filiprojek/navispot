import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppleMusicAdapter,
  createAppleMusicAdapter,
  toUnifiedTrack,
  toUnifiedPlaylist,
  toDestinationMatchCandidate,
} from './apple-music-adapter';
import { AppleMusicClient } from '@/lib/apple-music/client';
import {
  AppleMusicPlaylistAttributes,
  AppleMusicResource,
  AppleMusicSongAttributes,
} from '@/lib/apple-music/types';

describe('Apple Music Adapter & Type Conversions', () => {
  const sampleSong: AppleMusicResource<AppleMusicSongAttributes> = {
    id: '1649492161',
    type: 'songs',
    href: '/v1/catalog/us/songs/1649492161',
    attributes: {
      name: 'Anti-Hero',
      artistName: 'Taylor Swift',
      albumName: 'Midnights',
      durationInMillis: 200690,
      isrc: 'USUG12205736',
      releaseDate: '2022-10-21',
      url: 'https://music.apple.com/us/song/anti-hero/1649492161',
      artwork: {
        url: 'https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.jpg',
        width: 3000,
        height: 3000,
      },
    },
  };

  const sampleCatalogPlaylist: AppleMusicResource<AppleMusicPlaylistAttributes> = {
    id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
    type: 'playlists',
    attributes: {
      name: "Today's Hits",
      description: {
        standard: 'The biggest songs right now.',
      },
      curatorName: 'Apple Music',
      artwork: {
        url: 'https://is1-ssl.mzstatic.com/image/thumb/Features/{w}x{h}bb.jpg',
      },
    },
    relationships: {
      tracks: {
        data: [sampleSong],
      },
    },
  };

  const sampleLibraryPlaylist: AppleMusicResource<AppleMusicPlaylistAttributes> = {
    id: 'p.abc123',
    type: 'library-playlists',
    attributes: {
      name: 'My Running Mix',
      description: 'Morning runs',
      curatorName: 'User',
    },
  };

  describe('toUnifiedTrack', () => {
    it('converts AppleMusicResource<Song> to UnifiedTrack', () => {
      const unified = toUnifiedTrack(sampleSong);

      expect(unified.id).toBe('1649492161');
      expect(unified.title).toBe('Anti-Hero');
      expect(unified.artists).toEqual([{ name: 'Taylor Swift' }]);
      expect(unified.album).toEqual({
        name: 'Midnights',
        releaseDate: '2022-10-21',
      });
      expect(unified.durationMs).toBe(200690);
      expect(unified.isrc).toBe('USUG12205736');
      expect(unified.provider).toBe('apple-music');
      expect(unified.uri).toBe('https://music.apple.com/us/song/anti-hero/1649492161');
      expect(unified.raw).toBe(sampleSong);
    });

    it('handles minimal song attributes with defaults', () => {
      const minimalSong: AppleMusicResource<AppleMusicSongAttributes> = {
        id: 'song-minimal',
        type: 'songs',
        attributes: {
          name: 'Minimal',
          artistName: '',
        },
      };

      const unified = toUnifiedTrack(minimalSong);
      expect(unified.id).toBe('song-minimal');
      expect(unified.title).toBe('Minimal');
      expect(unified.artists).toEqual([{ name: 'Unknown Artist' }]);
      expect(unified.durationMs).toBe(0);
      expect(unified.isrc).toBeUndefined();
    });
  });

  describe('toUnifiedPlaylist', () => {
    it('converts catalog playlist with artwork and public status', () => {
      const unified = toUnifiedPlaylist(sampleCatalogPlaylist);

      expect(unified.id).toBe('pl.f4d106fed2bd41149aaacabb233eb5eb');
      expect(unified.name).toBe("Today's Hits");
      expect(unified.description).toBe('The biggest songs right now.');
      expect(unified.owner.displayName).toBe('Apple Music');
      expect(unified.trackCount).toBe(1);
      expect(unified.imageUrl).toBe(
        'https://is1-ssl.mzstatic.com/image/thumb/Features/300x300bb.jpg'
      );
      expect(unified.provider).toBe('apple-music');
      expect(unified.isPublic).toBe(true);
      expect(unified.isImported).toBe(true);
      expect(unified.isLikedSongs).toBe(false);
    });

    it('converts library playlist with private status', () => {
      const unified = toUnifiedPlaylist(sampleLibraryPlaylist, 25);

      expect(unified.id).toBe('p.abc123');
      expect(unified.name).toBe('My Running Mix');
      expect(unified.description).toBe('Morning runs');
      expect(unified.owner.displayName).toBe('User');
      expect(unified.trackCount).toBe(25);
      expect(unified.isPublic).toBe(false);
      expect(unified.isImported).toBe(false);
    });

    it('marks liked songs collection', () => {
      const unified = toUnifiedPlaylist(sampleLibraryPlaylist, 10, true);
      expect(unified.isLikedSongs).toBe(true);
    });
  });

  describe('toDestinationMatchCandidate', () => {
    it('converts Apple Music song to DestinationMatchCandidate', () => {
      const candidate = toDestinationMatchCandidate(sampleSong);

      expect(candidate.id).toBe('1649492161');
      expect(candidate.title).toBe('Anti-Hero');
      expect(candidate.artist).toBe('Taylor Swift');
      expect(candidate.album).toBe('Midnights');
      expect(candidate.durationMs).toBe(200690);
      expect(candidate.isrc).toBe('USUG12205736');
      expect(candidate.raw).toBe(sampleSong);
    });
  });

  describe('AppleMusicAdapter methods', () => {
    let mockClient: AppleMusicClient;
    let adapter: AppleMusicAdapter;

    beforeEach(() => {
      mockClient = {
        isAuthenticated: vi.fn().mockReturnValue(true),
        getAllLibraryPlaylists: vi.fn().mockResolvedValue([sampleLibraryPlaylist]),
        getLibraryPlaylistTracks: vi.fn().mockResolvedValue([sampleSong]),
        getLibrarySongs: vi.fn().mockResolvedValue([sampleSong]),
        getCatalogPlaylist: vi.fn().mockResolvedValue({
          playlist: sampleCatalogPlaylist,
          tracks: [sampleSong],
        }),
        searchByIsrc: vi.fn().mockResolvedValue([sampleSong]),
        searchSongs: vi.fn().mockResolvedValue([sampleSong]),
        createLibraryPlaylist: vi.fn().mockResolvedValue({ id: 'created-pl-id', success: true }),
        addTracksToLibraryPlaylist: vi.fn().mockResolvedValue({ success: true }),
        addSongToLibrary: vi.fn().mockResolvedValue({ success: true }),
      } as unknown as AppleMusicClient;

      adapter = createAppleMusicAdapter(mockClient);
    });

    it('checks authentication status', () => {
      expect(adapter.isAuthenticated()).toBe(true);
      expect(adapter.isConnected()).toBe(true);

      vi.mocked(mockClient.isAuthenticated).mockReturnValue(false);
      expect(adapter.isAuthenticated()).toBe(false);
      expect(adapter.isConnected()).toBe(false);
    });

    it('lists user library playlists', async () => {
      const playlists = await adapter.listPlaylists();
      expect(mockClient.getAllLibraryPlaylists).toHaveBeenCalled();
      expect(playlists).toHaveLength(1);
      expect(playlists[0].id).toBe('p.abc123');
      expect(playlists[0].name).toBe('My Running Mix');
    });

    it('gets playlist tracks for normal playlist', async () => {
      const tracks = await adapter.getPlaylistTracks('p.abc123');
      expect(mockClient.getLibraryPlaylistTracks).toHaveBeenCalledWith('p.abc123', {
        signal: undefined,
      });
      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe('1649492161');
    });

    it('gets playlist tracks for library-songs by delegating to getFavorites', async () => {
      const tracks = await adapter.getPlaylistTracks('library-songs');
      expect(mockClient.getLibrarySongs).toHaveBeenCalled();
      expect(tracks).toHaveLength(1);
      expect(tracks[0].title).toBe('Anti-Hero');
    });

    it('gets user favorites', async () => {
      const tracks = await adapter.getFavorites();
      expect(mockClient.getLibrarySongs).toHaveBeenCalled();
      expect(tracks).toHaveLength(1);
      expect(tracks[0].isrc).toBe('USUG12205736');
    });

    it('canParseUrl validates Apple Music URLs and rejects others', () => {
      expect(
        adapter.canParseUrl(
          'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
        )
      ).toBe(true);
      expect(
        adapter.canParseUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBe(false);
    });

    describe('getPublicPlaylist', () => {
      it('uses injected publicPlaylistFetcher when provided', async () => {
        const customFetcher = vi.fn().mockResolvedValue({
          playlist: toUnifiedPlaylist(sampleCatalogPlaylist),
          tracks: [toUnifiedTrack(sampleSong)],
        });

        const customAdapter = new AppleMusicAdapter(mockClient, customFetcher);
        const res = await customAdapter.getPublicPlaylist(
          'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
        );

        expect(customFetcher).toHaveBeenCalled();
        expect(res.playlist.name).toBe("Today's Hits");
        expect(res.tracks).toHaveLength(1);
      });

      it('calls /api/apple-music/public-playlist in browser environment', async () => {
        const fetchSpy = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            playlist: toUnifiedPlaylist(sampleCatalogPlaylist),
            tracks: [toUnifiedTrack(sampleSong)],
          }),
        });
        vi.stubGlobal('window', {});
        vi.stubGlobal('fetch', fetchSpy);

        const res = await adapter.getPublicPlaylist(
          'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
        );

        expect(fetchSpy).toHaveBeenCalledWith(
          '/api/apple-music/public-playlist',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              url: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
            }),
          })
        );
        expect(res.playlist.id).toBe('pl.f4d106fed2bd41149aaacabb233eb5eb');

        vi.unstubAllGlobals();
      });

      it('falls back to client.getCatalogPlaylist in server environment', async () => {
        const globalScope = globalThis as unknown as { window?: Window };
        const originalWindow = globalScope.window;
        delete globalScope.window;

        try {
          const res = await adapter.getPublicPlaylist(
            'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb'
          );

          expect(mockClient.getCatalogPlaylist).toHaveBeenCalledWith(
            'us',
            'pl.f4d106fed2bd41149aaacabb233eb5eb',
            undefined
          );
          expect(res.playlist.name).toBe("Today's Hits");
          expect(res.tracks[0].title).toBe('Anti-Hero');
        } finally {
          globalScope.window = originalWindow;
        }
      });

      it('throws an error for invalid URLs', async () => {
        await expect(adapter.getPublicPlaylist('https://invalid-url.com')).rejects.toThrow(
          'Invalid Apple Music playlist URL'
        );
      });
    });

    describe('DestinationProvider methods', () => {
      it('searches by ISRC', async () => {
        const candidates = await adapter.searchByIsrc('USUG12205736');
        expect(mockClient.searchByIsrc).toHaveBeenCalledWith('USUG12205736', undefined, undefined);
        expect(candidates).toHaveLength(1);
        expect(candidates[0].id).toBe('1649492161');
        expect(candidates[0].artist).toBe('Taylor Swift');
      });

      it('searches by query with title and artist', async () => {
        const candidates = await adapter.searchByQuery({
          title: 'Anti-Hero',
          artist: 'Taylor Swift',
        });
        expect(mockClient.searchSongs).toHaveBeenCalledWith(
          'Anti-Hero Taylor Swift',
          undefined,
          20,
          undefined
        );
        expect(candidates).toHaveLength(1);
        expect(candidates[0].title).toBe('Anti-Hero');
      });

      it('falls back to searching by title only when combined query returns no results', async () => {
        vi.mocked(mockClient.searchSongs)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([sampleSong]);

        const candidates = await adapter.searchByQuery({
          title: 'Anti-Hero',
          artist: 'Taylor Swift',
        });

        expect(mockClient.searchSongs).toHaveBeenNthCalledWith(
          1,
          'Anti-Hero Taylor Swift',
          undefined,
          20,
          undefined
        );
        expect(mockClient.searchSongs).toHaveBeenNthCalledWith(
          2,
          'Anti-Hero',
          undefined,
          20,
          undefined
        );
        expect(candidates).toHaveLength(1);
      });

      it('creates library playlist with trackIds and options', async () => {
        const res = await adapter.createPlaylist('Favorites', ['1649492161'], {
          description: 'Top picks',
        });
        expect(mockClient.createLibraryPlaylist).toHaveBeenCalledWith(
          'Favorites',
          'Top picks',
          [{ id: '1649492161', type: 'songs' }]
        );
        expect(res).toEqual({ id: 'created-pl-id', success: true });
      });

      it('appends tracks to library playlist', async () => {
        const res = await adapter.appendToPlaylist('p.123', ['1649492161']);
        expect(mockClient.addTracksToLibraryPlaylist).toHaveBeenCalledWith('p.123', [
          { id: '1649492161', type: 'songs' },
        ]);
        expect(res).toEqual({ success: true });
      });

      it('saves favorites into user library', async () => {
        const res = await adapter.saveFavorites(['1649492161', '1002']);
        expect(mockClient.addSongToLibrary).toHaveBeenCalledWith('1649492161');
        expect(mockClient.addSongToLibrary).toHaveBeenCalledWith('1002');
        expect(res).toEqual({ success: true });
      });
    });
  });
});
