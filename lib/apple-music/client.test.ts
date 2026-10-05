import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppleMusicClient, AppleMusicApiError } from './client';

describe('AppleMusicClient', () => {
  const mockDeveloperToken = 'mock-developer-token';
  const mockMusicUserToken = 'mock-user-token';

  let client: AppleMusicClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    client = new AppleMusicClient({
      developerToken: mockDeveloperToken,
      musicUserToken: mockMusicUserToken,
      storefront: 'us',
    });
  });

  it('initializes with tokens and storefront', () => {
    expect(client.isAuthenticated()).toBe(true);
    expect(client.hasDeveloperToken()).toBe(true);
    expect(client.getStorefront()).toBe('us');

    const unauthed = new AppleMusicClient({});
    expect(unauthed.isAuthenticated()).toBe(false);
  });

  it('updates tokens and storefront via setTokens and setStorefront', () => {
    const c = new AppleMusicClient({});
    expect(c.isAuthenticated()).toBe(false);

    c.setTokens({ developerToken: 'new-dev', musicUserToken: 'new-user', storefront: 'gb' });
    expect(c.isAuthenticated()).toBe(true);
    expect(c.getStorefront()).toBe('gb');

    c.setStorefront('fr');
    expect(c.getStorefront()).toBe('fr');
  });

  describe('getLibraryPlaylists & getAllLibraryPlaylists', () => {
    it('fetches a single page of library playlists with correct headers and params', async () => {
      const mockResponse = {
        data: [
          {
            id: 'p.1',
            type: 'library-playlists',
            attributes: { name: 'Playlist 1' },
          },
        ],
        next: '/v1/me/library/playlists?offset=100',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const res = await client.getLibraryPlaylists({ limit: 50, offset: 0 });

      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('p.1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.music.apple.com/v1/me/library/playlists?limit=50&offset=0',
        expect.objectContaining({
          headers: expect.any(Headers),
        })
      );

      const calledHeaders = fetchMock.mock.calls[0][1].headers as Headers;
      expect(calledHeaders.get('Authorization')).toBe(`Bearer ${mockDeveloperToken}`);
      expect(calledHeaders.get('Music-User-Token')).toBe(mockMusicUserToken);
    });

    it('paginates and retrieves all user library playlists', async () => {
      const page1 = {
        data: [{ id: 'p.1', type: 'library-playlists', attributes: { name: 'P1' } }],
        next: 'https://api.music.apple.com/v1/me/library/playlists?offset=1',
      };
      const page2 = {
        data: [{ id: 'p.2', type: 'library-playlists', attributes: { name: 'P2' } }],
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(page1),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(page2),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const playlists = await client.getAllLibraryPlaylists();

      expect(playlists).toHaveLength(2);
      expect(playlists.map((p) => p.id)).toEqual(['p.1', 'p.2']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLibraryPlaylistTracks', () => {
    it('fetches library playlist tracks with pagination', async () => {
      const page1 = {
        data: [
          {
            id: 't.1',
            type: 'library-songs',
            attributes: { name: 'Track 1', artistName: 'Artist 1' },
          },
        ],
        next: '/v1/me/library/playlists/p.123/tracks?offset=1',
      };
      const page2 = {
        data: [
          {
            id: 't.2',
            type: 'library-songs',
            attributes: { name: 'Track 2', artistName: 'Artist 2' },
          },
        ],
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(page1),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(page2),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const tracks = await client.getLibraryPlaylistTracks('p.123');

      expect(tracks).toHaveLength(2);
      expect(tracks[0].id).toBe('t.1');
      expect(tracks[1].id).toBe('t.2');
    });
  });

  describe('getLibrarySongs', () => {
    it('fetches library songs (favorites) with pagination', async () => {
      const response = {
        data: [
          {
            id: 's.1',
            type: 'library-songs',
            attributes: { name: 'Loved Track', artistName: 'Artist' },
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const songs = await client.getLibrarySongs();
      expect(songs).toHaveLength(1);
      expect(songs[0].id).toBe('s.1');
      expect(songs[0].attributes.name).toBe('Loved Track');
    });
  });

  describe('getCatalogPlaylist', () => {
    it('fetches catalog playlist and tracks relationships with pagination', async () => {
      const catalogResponse = {
        data: [
          {
            id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
            type: 'playlists',
            attributes: {
              name: "Today's Hits",
              curatorName: 'Apple Music',
            },
            relationships: {
              tracks: {
                data: [
                  {
                    id: '1001',
                    type: 'songs',
                    attributes: { name: 'Hit 1', artistName: 'Artist 1' },
                  },
                ],
                next: 'https://api.music.apple.com/v1/catalog/us/playlists/pl.f4d106fed2bd41149aaacabb233eb5eb/tracks?offset=1',
              },
            },
          },
        ],
      };

      const tracksPage2 = {
        data: [
          {
            id: '1002',
            type: 'songs',
            attributes: { name: 'Hit 2', artistName: 'Artist 2' },
          },
        ],
      };

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(catalogResponse),
          headers: new Headers({ 'content-type': 'application/json' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => JSON.stringify(tracksPage2),
          headers: new Headers({ 'content-type': 'application/json' }),
        });

      const result = await client.getCatalogPlaylist(
        'us',
        'pl.f4d106fed2bd41149aaacabb233eb5eb'
      );

      expect(result.playlist.id).toBe('pl.f4d106fed2bd41149aaacabb233eb5eb');
      expect(result.playlist.attributes.name).toBe("Today's Hits");
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks[0].id).toBe('1001');
      expect(result.tracks[1].id).toBe('1002');
    });

    it('throws AppleMusicApiError 404 when catalog playlist is not found', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(client.getCatalogPlaylist('us', 'pl.nonexistent')).rejects.toThrow(
        AppleMusicApiError
      );
    });
  });

  describe('searchByIsrc', () => {
    it('queries catalog songs using isrc filter', async () => {
      const response = {
        data: [
          {
            id: 'song123',
            type: 'songs',
            attributes: {
              name: 'Song Title',
              artistName: 'Artist Name',
              isrc: 'USUM71234567',
            },
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const songs = await client.searchByIsrc('USUM71234567');

      expect(songs).toHaveLength(1);
      expect(songs[0].id).toBe('song123');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=USUM71234567',
        expect.anything()
      );
    });
  });

  describe('searchSongs', () => {
    it('searches catalog songs by query term and limit', async () => {
      const response = {
        results: {
          songs: {
            data: [
              {
                id: 'song456',
                type: 'songs',
                attributes: { name: 'Search Hit', artistName: 'Famous Artist' },
              },
            ],
          },
        },
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(response),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const songs = await client.searchSongs('Famous Artist Search Hit', 'gb', 10);

      expect(songs).toHaveLength(1);
      expect(songs[0].id).toBe('song456');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/catalog/gb/search?term='),
        expect.anything()
      );
    });
  });

  describe('createLibraryPlaylist', () => {
    it('creates a new library playlist and returns its ID', async () => {
      const response = {
        data: [
          {
            id: 'p.new123',
            type: 'library-playlists',
            attributes: { name: 'My New Playlist' },
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify(response),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      const res = await client.createLibraryPlaylist(
        'My New Playlist',
        'Description',
        [{ id: 'song1', type: 'songs' }]
      );

      expect(res).toEqual({ id: 'p.new123', success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.music.apple.com/v1/me/library/playlists',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            attributes: {
              name: 'My New Playlist',
              description: 'Description',
            },
            relationships: {
              tracks: {
                data: [{ id: 'song1', type: 'songs' }],
              },
            },
          }),
        })
      );
    });
  });

  describe('addTracksToLibraryPlaylist', () => {
    it('batches tracks in chunks of 100', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => '',
          headers: new Headers(),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          text: async () => '',
          headers: new Headers(),
        });

      // 150 tracks to trigger 2 chunks
      const trackData = Array.from({ length: 150 }, (_, i) => ({
        id: `song-${i}`,
        type: 'songs',
      }));

      const res = await client.addTracksToLibraryPlaylist('p.123', trackData);

      expect(res).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const firstCallBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(firstCallBody.data).toHaveLength(100);

      const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondCallBody.data).toHaveLength(50);
    });
  });

  describe('addSongToLibrary', () => {
    it('calls POST /me/library?ids[songs]=:id', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => '',
        headers: new Headers(),
      });

      const res = await client.addSongToLibrary('123456');

      expect(res).toEqual({ success: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.music.apple.com/v1/me/library?ids[songs]=123456',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Error handling', () => {
    it('throws AppleMusicApiError with parsed error detail on HTTP 403', async () => {
      const errorPayload = {
        errors: [
          {
            id: 'err1',
            title: 'Forbidden',
            detail: 'User token is invalid or expired',
            status: '403',
          },
        ],
      };

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => JSON.stringify(errorPayload),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      await expect(client.getLibrarySongs()).rejects.toThrow(AppleMusicApiError);

      try {
        fetchMock.mockResolvedValueOnce({
          ok: false,
          status: 403,
          text: async () => JSON.stringify(errorPayload),
          headers: new Headers({ 'content-type': 'application/json' }),
        });
        await client.getLibrarySongs();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppleMusicApiError);
        const apiErr = err as AppleMusicApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.message).toContain('User token is invalid or expired');
      }
    });
  });
});
