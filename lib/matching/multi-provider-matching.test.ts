import { describe, it, expect, vi } from 'vitest';
import {
  matchUnifiedTrack,
  matchUnifiedTracks,
  getMatchStatistics,
  getUnmatchedUnifiedTracks,
  getMatchedUnifiedTracks,
  candidateToNavidromeSong,
  trackToSpotifyTrack,
  getUnifiedTrackKey,
} from '@/lib/matching/orchestrator';
import {
  createUnifiedBatchMatcher,
  DefaultUnifiedBatchMatcher,
  BatchMatcherProgress,
} from '@/lib/matching/batch-matcher';
import {
  createUnifiedPlaylistExporter,
  DefaultUnifiedPlaylistExporter,
} from '@/lib/export/playlist-exporter';
import {
  DestinationProvider,
  DestinationMatchCandidate,
  UnifiedTrack,
} from '@/types/provider';
import { TrackMatch } from '@/types/matching';
import { TrackExportStatus } from '@/lib/export/track-export-cache';

function createMockDestination(overrides?: Partial<DestinationProvider>): DestinationProvider {
  return {
    id: 'navidrome',
    name: 'Navidrome Mock',
    isConnected: vi.fn().mockReturnValue(true),
    isAuthenticated: vi.fn().mockReturnValue(true),
    searchByIsrc: vi.fn().mockResolvedValue([]),
    searchByQuery: vi.fn().mockResolvedValue([]),
    createPlaylist: vi.fn().mockResolvedValue({ id: 'mock-pl-123', success: true }),
    appendToPlaylist: vi.fn().mockResolvedValue({ success: true }),
    saveFavorites: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe('Multi-Provider Matching Engine', () => {
  describe('Apple Music to Navidrome Matching', () => {
    it('matches Apple Music UnifiedTrack to Navidrome by ISRC', async () => {
      const appleTrack: UnifiedTrack = {
        id: 'am-1',
        title: 'Blinding Lights',
        artists: [{ name: 'The Weeknd' }],
        album: { name: 'After Hours' },
        durationMs: 200000,
        isrc: 'USUG11904206',
        provider: 'apple-music',
      };

      const navidromeCandidate: DestinationMatchCandidate = {
        id: 'nd-song-1',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        durationMs: 200000,
        isrc: 'USUG11904206',
        raw: {
          id: 'nd-song-1',
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          album: 'After Hours',
          duration: 200,
        },
      };

      const destination = createMockDestination({
        id: 'navidrome',
        name: 'Navidrome',
        searchByIsrc: vi.fn().mockResolvedValue([navidromeCandidate]),
      });

      const match = await matchUnifiedTrack(destination, appleTrack);

      expect(destination.searchByIsrc).toHaveBeenCalledWith('USUG11904206', undefined);
      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('isrc');
      expect(match.matchScore).toBe(1);
      expect(match.matchedSong?.id).toBe('nd-song-1');
      expect(match.navidromeSong?.id).toBe('nd-song-1');
      expect(match.track.id).toBe('am-1');
    });

    it('matches Apple Music UnifiedTrack to Navidrome by strict title and artist', async () => {
      const appleTrack: UnifiedTrack = {
        id: 'am-2',
        title: 'Save Your Tears',
        artists: [{ name: 'The Weeknd' }],
        album: { name: 'After Hours' },
        durationMs: 215000,
        provider: 'apple-music',
      };

      const navidromeCandidate: DestinationMatchCandidate = {
        id: 'nd-song-2',
        title: 'Save Your Tears',
        artist: 'The Weeknd',
        album: 'After Hours',
        durationMs: 215000,
      };

      const destination = createMockDestination({
        id: 'navidrome',
        name: 'Navidrome',
        searchByQuery: vi.fn().mockResolvedValue([navidromeCandidate]),
      });

      const match = await matchUnifiedTrack(destination, appleTrack);

      expect(destination.searchByQuery).toHaveBeenCalledWith(
        { title: 'Save Your Tears', artist: 'The Weeknd' },
        undefined
      );
      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('strict');
      expect(match.matchScore).toBe(1);
      expect(match.matchedSong?.id).toBe('nd-song-2');
    });

    it('matches Apple Music UnifiedTrack to Navidrome by fuzzy matching on spelling variation', async () => {
      const appleTrack: UnifiedTrack = {
        id: 'am-3',
        title: 'Blinding Lites',
        artists: [{ name: 'The Weeknd' }],
        album: { name: 'After Hours' },
        durationMs: 200000,
        provider: 'apple-music',
      };

      // Candidate has corrected spelling and identical duration
      const navidromeCandidate: DestinationMatchCandidate = {
        id: 'nd-song-3',
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        album: 'After Hours',
        durationMs: 200000,
      };

      const destination = createMockDestination({
        id: 'navidrome',
        name: 'Navidrome',
        searchByQuery: vi.fn().mockResolvedValue([navidromeCandidate]),
      });

      const match = await matchUnifiedTrack(destination, appleTrack);

      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('fuzzy');
      expect(match.matchScore).toBeGreaterThanOrEqual(0.8);
      expect(match.matchedSong?.id).toBe('nd-song-3');
    });

    it('handles unmatched Apple Music track cleanly', async () => {
      const appleTrack: UnifiedTrack = {
        id: 'am-4',
        title: 'Rare Japanese Bonus Track',
        artists: [{ name: 'Indie Artist' }],
        album: { name: 'Rare EP' },
        durationMs: 150000,
        provider: 'apple-music',
      };

      const destination = createMockDestination({
        searchByQuery: vi.fn().mockResolvedValue([]),
      });

      const match = await matchUnifiedTrack(destination, appleTrack);

      expect(match.status).toBe('unmatched');
      expect(match.matchStrategy).toBe('none');
      expect(match.matchedSong).toBeUndefined();
    });

    it('handles ambiguous candidates cleanly', async () => {
      const appleTrack: UnifiedTrack = {
        id: 'am-5',
        title: 'Ambiguous Song',
        artists: [{ name: 'Artist One' }],
        album: { name: 'Album' },
        durationMs: 180000,
        provider: 'apple-music',
      };

      // Two completely different artists with similar titles
      const candidate1: DestinationMatchCandidate = {
        id: 'cand-1',
        title: 'Ambiguous Song',
        artist: 'Artist One',
        album: 'Album 1',
        durationMs: 180000,
      };
      const candidate2: DestinationMatchCandidate = {
        id: 'cand-2',
        title: 'Ambiguous Song',
        artist: 'Artist Two',
        album: 'Album 2',
        durationMs: 180000,
      };

      const destination = createMockDestination({
        // When searched with artist null / loose, returns both
        searchByQuery: vi.fn().mockResolvedValue([candidate1, candidate2]),
      });

      const match = await matchUnifiedTrack(destination, appleTrack);

      // Should be matched to candidate1 because of exact artist
      expect(match.status).toBe('matched');
      expect(match.matchedSong?.id).toBe('cand-1');
    });
  });

  describe('Spotify to Apple Music Matching', () => {
    it('matches Spotify UnifiedTrack against Apple Music destination by ISRC', async () => {
      const spotifyTrack: UnifiedTrack = {
        id: 'sp-1',
        title: 'Levitating',
        artists: [{ name: 'Dua Lipa' }],
        album: { name: 'Future Nostalgia' },
        durationMs: 203000,
        isrc: 'GBAHT2000185',
        provider: 'spotify',
        uri: 'spotify:track:sp-1',
      };

      const appleCandidate: DestinationMatchCandidate = {
        id: 'am-song-lev',
        title: 'Levitating',
        artist: 'Dua Lipa',
        album: 'Future Nostalgia',
        durationMs: 203000,
        isrc: 'GBAHT2000185',
      };

      const destination = createMockDestination({
        id: 'apple-music',
        name: 'Apple Music',
        searchByIsrc: vi.fn().mockResolvedValue([appleCandidate]),
      });

      const match = await matchUnifiedTrack(destination, spotifyTrack);

      expect(destination.searchByIsrc).toHaveBeenCalledWith('GBAHT2000185', undefined);
      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('isrc');
      expect(match.matchedSong?.id).toBe('am-song-lev');
      expect(match.spotifyTrack?.id).toBe('sp-1');
      expect(match.trackKey).toBe('spotify:track:sp-1');
    });

    it('matches Spotify UnifiedTrack against Apple Music destination by query', async () => {
      const spotifyTrack: UnifiedTrack = {
        id: 'sp-2',
        title: 'Physical',
        artists: [{ name: 'Dua Lipa' }],
        album: { name: 'Future Nostalgia' },
        durationMs: 193000,
        provider: 'spotify',
      };

      const appleCandidate: DestinationMatchCandidate = {
        id: 'am-song-phys',
        title: 'Physical',
        artist: 'Dua Lipa',
        album: 'Future Nostalgia',
        durationMs: 193000,
      };

      const destination = createMockDestination({
        id: 'apple-music',
        name: 'Apple Music',
        searchByQuery: vi.fn().mockResolvedValue([appleCandidate]),
      });

      const match = await matchUnifiedTrack(destination, spotifyTrack);

      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('strict');
      expect(match.matchedSong?.id).toBe('am-song-phys');
    });
  });

  describe('Navidrome to Spotify Matching', () => {
    it('matches Navidrome UnifiedTrack against Spotify destination', async () => {
      const navidromeTrack: UnifiedTrack = {
        id: 'nd-song-dsn',
        title: "Don't Start Now",
        artists: [{ name: 'Dua Lipa' }],
        album: { name: 'Future Nostalgia' },
        durationMs: 183000,
        isrc: 'GBAHT1901138',
        provider: 'navidrome',
      };

      const spotifyCandidate: DestinationMatchCandidate = {
        id: 'spotify-track-dsn',
        title: "Don't Start Now",
        artist: 'Dua Lipa',
        album: 'Future Nostalgia',
        durationMs: 183000,
        isrc: 'GBAHT1901138',
      };

      const destination = createMockDestination({
        id: 'spotify',
        name: 'Spotify',
        searchByIsrc: vi.fn().mockResolvedValue([spotifyCandidate]),
      });

      const match = await matchUnifiedTrack(destination, navidromeTrack);

      expect(destination.searchByIsrc).toHaveBeenCalledWith('GBAHT1901138', undefined);
      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('isrc');
      expect(match.matchedSong?.id).toBe('spotify-track-dsn');
      expect(match.trackKey).toBe('navidrome:track:nd-song-dsn');
    });

    it('matches Navidrome UnifiedTrack against Spotify destination via fuzzy search', async () => {
      const navidromeTrack: UnifiedTrack = {
        id: 'nd-song-fuz',
        title: 'Midnight City',
        artists: [{ name: 'M83' }],
        album: { name: 'Hurry Up, We\'re Dreaming' },
        durationMs: 243000,
        provider: 'navidrome',
      };

      const spotifyCandidate: DestinationMatchCandidate = {
        id: 'spotify-track-m83',
        title: 'Midnight Cty',
        artist: 'M83',
        album: 'Hurry Up, We\'re Dreaming',
        durationMs: 243000,
      };

      const destination = createMockDestination({
        id: 'spotify',
        name: 'Spotify',
        searchByQuery: vi.fn().mockResolvedValue([spotifyCandidate]),
      });

      const match = await matchUnifiedTrack(destination, navidromeTrack);

      expect(match.status).toBe('matched');
      expect(match.matchStrategy).toBe('fuzzy');
      expect(match.matchedSong?.id).toBe('spotify-track-m83');
    });
  });

  describe('Batch Matching Engine (UnifiedBatchMatcher)', () => {
    it('matches an array of UnifiedTracks and reports progress and statistics', async () => {
      const tracks: UnifiedTrack[] = [
        {
          id: 't1',
          title: 'Track One',
          artists: [{ name: 'Artist A' }],
          album: { name: 'Album 1' },
          durationMs: 200000,
          isrc: 'ISRC1',
          provider: 'apple-music',
        },
        {
          id: 't2',
          title: 'Track Two',
          artists: [{ name: 'Artist B' }],
          album: { name: 'Album 2' },
          durationMs: 210000,
          provider: 'apple-music',
        },
        {
          id: 't3',
          title: 'Unknown Track',
          artists: [{ name: 'Unknown' }],
          album: { name: 'Unknown' },
          durationMs: 180000,
          provider: 'apple-music',
        },
      ];

      const destination = createMockDestination({
        searchByIsrc: vi.fn().mockImplementation((isrc) => {
          if (isrc === 'ISRC1') {
            return Promise.resolve([
              { id: 'dest-1', title: 'Track One', artist: 'Artist A', album: 'Album 1', durationMs: 200000, isrc: 'ISRC1' },
            ]);
          }
          return Promise.resolve([]);
        }),
        searchByQuery: vi.fn().mockImplementation((q) => {
          if (q.title === 'Track Two') {
            return Promise.resolve([
              { id: 'dest-2', title: 'Track Two', artist: 'Artist B', album: 'Album 2', durationMs: 210000 },
            ]);
          }
          return Promise.resolve([]);
        }),
      });

      const batchMatcher = createUnifiedBatchMatcher();
      const progressCalls: BatchMatcherProgress[] = [];

      const result = await batchMatcher.matchTracks(tracks, destination, {}, (p) => {
        progressCalls.push(p);
      });

      expect(result.matches).toHaveLength(3);
      expect(result.matches[0].status).toBe('matched');
      expect(result.matches[0].matchStrategy).toBe('isrc');
      expect(result.matches[1].status).toBe('matched');
      expect(result.matches[1].matchStrategy).toBe('strict');
      expect(result.matches[2].status).toBe('unmatched');

      expect(result.statistics.total).toBe(3);
      expect(result.statistics.matched).toBe(2);
      expect(result.statistics.unmatched).toBe(1);
      expect(result.statistics.byStrategy.isrc).toBe(1);
      expect(result.statistics.byStrategy.strict).toBe(1);

      expect(progressCalls.length).toBe(3);
      expect(progressCalls[2].percent).toBe(100);
      expect(progressCalls[2].matched).toBe(2);
    });

    it('matches concurrently when concurrency > 1', async () => {
      const tracks: UnifiedTrack[] = Array.from({ length: 6 }, (_, i) => ({
        id: `c-track-${i}`,
        title: `Song ${i}`,
        artists: [{ name: `Artist ${i}` }],
        album: { name: `Album ${i}` },
        durationMs: 200000,
        provider: 'spotify',
      }));

      const destination = createMockDestination({
        searchByQuery: vi.fn().mockImplementation((q) =>
          Promise.resolve([
            { id: `dest-${q.title}`, title: q.title, artist: q.artist, album: 'Album', durationMs: 200000 },
          ])
        ),
      });

      const batchMatcher = new DefaultUnifiedBatchMatcher();
      const result = await batchMatcher.matchTracks(tracks, destination, { concurrency: 3 });

      expect(result.matches).toHaveLength(6);
      expect(result.statistics.matched).toBe(6);
    });

    it('performs differential matching using cachedTracks', async () => {
      const tracks: UnifiedTrack[] = [
        {
          id: 'cached-1',
          title: 'Cached Song',
          artists: [{ name: 'Artist Cached' }],
          album: { name: 'Album' },
          durationMs: 200000,
          provider: 'spotify',
          uri: 'spotify:track:cached-1',
        },
        {
          id: 'new-1',
          title: 'Brand New Song',
          artists: [{ name: 'New Artist' }],
          album: { name: 'Album New' },
          durationMs: 220000,
          provider: 'spotify',
          uri: 'spotify:track:new-1',
        },
      ];

      const cachedStatus: Record<string, TrackExportStatus> = {
        'spotify:track:cached-1': {
          spotifyTrackId: 'cached-1',
          navidromeSongId: 'nd-cached-id',
          status: 'matched',
          matchStrategy: 'strict',
          matchScore: 1,
          matchedAt: '2026-01-01T00:00:00Z',
        },
      };

      const destination = createMockDestination({
        searchByQuery: vi.fn().mockResolvedValue([
          { id: 'dest-new-id', title: 'Brand New Song', artist: 'New Artist', album: 'Album New', durationMs: 220000 },
        ]),
      });

      const batchMatcher = createUnifiedBatchMatcher();
      const result = await batchMatcher.matchTracksDifferential(tracks, destination, cachedStatus);

      // Only new track should trigger search on destination
      expect(destination.searchByQuery).toHaveBeenCalledTimes(1);
      expect(result.matches).toHaveLength(2);
      expect(result.matches[0].matchedSong?.id).toBe('nd-cached-id');
      expect(result.matches[1].matchedSong?.id).toBe('dest-new-id');
      expect(result.newTracks).toHaveLength(1);
      expect(result.cachedMatches).toHaveLength(1);
    });

    it('handles cancellation signal in matchUnifiedTracks', async () => {
      const tracks: UnifiedTrack[] = [
        {
          id: 'abort-1',
          title: 'Song',
          artists: [{ name: 'Artist' }],
          album: { name: 'Album' },
          durationMs: 200000,
          provider: 'apple-music',
        },
      ];

      const controller = new AbortController();
      controller.abort();

      const destination = createMockDestination();

      await expect(
        matchUnifiedTracks(destination, tracks, {}, controller.signal)
      ).rejects.toThrow('Export was cancelled');
    });
  });

  describe('Unified Playlist Exporter', () => {
    it('creates a playlist on destination with matched track IDs', async () => {
      const destination = createMockDestination({
        id: 'apple-music',
        createPlaylist: vi.fn().mockResolvedValue({ id: 'created-pl-999', success: true }),
      });

      const exporter = createUnifiedPlaylistExporter(destination);

      const matches: TrackMatch[] = [
        {
          track: {
            id: 't1',
            title: 'Song 1',
            artists: [{ name: 'Artist 1' }],
            album: { name: 'Album 1' },
            durationMs: 200000,
            provider: 'spotify',
          },
          matchedSong: {
            id: 'dest-song-1',
            title: 'Song 1',
            artist: 'Artist 1',
            album: 'Album 1',
            durationMs: 200000,
          },
          matchScore: 1,
          matchStrategy: 'strict',
          status: 'matched',
          trackKey: 'key-1',
        },
        {
          track: {
            id: 't2',
            title: 'Song 2',
            artists: [{ name: 'Artist 2' }],
            album: { name: 'Album 2' },
            durationMs: 210000,
            provider: 'spotify',
          },
          matchedSong: {
            id: 'dest-song-2',
            title: 'Song 2',
            artist: 'Artist 2',
            album: 'Album 2',
            durationMs: 210000,
          },
          matchScore: 0.9,
          matchStrategy: 'fuzzy',
          status: 'matched',
          trackKey: 'key-2',
        },
        {
          track: {
            id: 't3',
            title: 'Unmatched Song',
            artists: [{ name: 'Artist 3' }],
            album: { name: 'Album 3' },
            durationMs: 180000,
            provider: 'spotify',
          },
          matchedSong: undefined,
          matchScore: 0,
          matchStrategy: 'none',
          status: 'unmatched',
          trackKey: 'key-3',
        },
      ];

      const result = await exporter.exportPlaylist('My Awesome Playlist', matches, {
        mode: 'create',
        isPublic: true,
      });

      expect(destination.createPlaylist).toHaveBeenCalledWith(
        'My Awesome Playlist',
        ['dest-song-1', 'dest-song-2'],
        { isPublic: true }
      );
      expect(result.success).toBe(true);
      expect(result.playlistId).toBe('created-pl-999');
      expect(result.statistics.exported).toBe(2);
      expect(result.statistics.total).toBe(3);
    });

    it('appends tracks to an existing playlist on destination', async () => {
      const destination = createMockDestination({
        appendToPlaylist: vi.fn().mockResolvedValue({ success: true }),
      });

      const exporter = new DefaultUnifiedPlaylistExporter(destination);

      const matches: TrackMatch[] = [
        {
          track: {
            id: 't1',
            title: 'Song 1',
            artists: [{ name: 'Artist' }],
            album: { name: 'Album' },
            durationMs: 200000,
            provider: 'navidrome',
          },
          matchedSong: {
            id: 'dest-song-1',
            title: 'Song 1',
            artist: 'Artist',
            album: 'Album',
            durationMs: 200000,
          },
          matchScore: 1,
          matchStrategy: 'strict',
          status: 'matched',
          trackKey: 'k-1',
        },
      ];

      const result = await exporter.exportPlaylist('Append Test', matches, {
        mode: 'append',
        existingPlaylistId: 'existing-pl-456',
      });

      expect(destination.appendToPlaylist).toHaveBeenCalledWith('existing-pl-456', ['dest-song-1']);
      expect(result.success).toBe(true);
      expect(result.playlistId).toBe('existing-pl-456');
    });

    it('handles empty matches without calling destination', async () => {
      const destination = createMockDestination();
      const exporter = createUnifiedPlaylistExporter(destination);

      const result = await exporter.exportPlaylist('Empty', []);

      expect(destination.createPlaylist).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.statistics.exported).toBe(0);
      expect(result.statistics.skipped).toBe(0);
    });

    it('handles destination export failures gracefully', async () => {
      const destination = createMockDestination({
        createPlaylist: vi.fn().mockResolvedValue({ id: '', success: false }),
      });

      const exporter = createUnifiedPlaylistExporter(destination);
      const matches: TrackMatch[] = [
        {
          track: {
            id: 't1',
            title: 'Song 1',
            artists: [{ name: 'Artist' }],
            album: { name: 'Album' },
            durationMs: 200000,
            provider: 'spotify',
          },
          matchedSong: {
            id: 'cand-1',
            title: 'Song 1',
            artist: 'Artist',
            album: 'Album',
            durationMs: 200000,
          },
          matchScore: 1,
          matchStrategy: 'strict',
          status: 'matched',
          trackKey: 'k1',
        },
      ];

      const result = await exporter.exportPlaylist('Fail Test', matches);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.statistics.failed).toBe(1);
    });
  });

  describe('Helper Functions', () => {
    it('converts candidate to NavidromeSong and track to SpotifyTrack', () => {
      const candidate: DestinationMatchCandidate = {
        id: 'c1',
        title: 'Title',
        artist: 'Artist',
        album: 'Album',
        durationMs: 200000,
        isrc: 'ISRC123',
      };

      const ndSong = candidateToNavidromeSong(candidate);
      expect(ndSong?.id).toBe('c1');
      expect(ndSong?.duration).toBe(200);
      expect(ndSong?.isrc).toEqual(['ISRC123']);

      const unified: UnifiedTrack = {
        id: 'u1',
        title: 'Song',
        artists: [{ name: 'A1' }],
        album: { name: 'Al1' },
        durationMs: 180000,
        provider: 'spotify',
      };

      const spTrack = trackToSpotifyTrack(unified);
      expect(spTrack.id).toBe('u1');
      expect(spTrack.name).toBe('Song');
      expect(spTrack.duration_ms).toBe(180000);

      const tk = getUnifiedTrackKey(unified);
      expect(tk).toBe('spotify:track:u1');
    });

    it('extracts unmatched and matched unified tracks', () => {
      const matches: TrackMatch[] = [
        {
          track: { id: 'm1', title: 'Matched', artists: [{ name: 'A' }], album: { name: 'Al' }, durationMs: 200, provider: 'spotify' },
          matchedSong: { id: 'd1', title: 'Matched', artist: 'A', album: 'Al', durationMs: 200 },
          matchScore: 1,
          matchStrategy: 'strict',
          status: 'matched',
          trackKey: 'k1',
        },
        {
          track: { id: 'u1', title: 'Unmatched', artists: [{ name: 'B' }], album: { name: 'Al' }, durationMs: 200, provider: 'spotify' },
          matchScore: 0,
          matchStrategy: 'none',
          status: 'unmatched',
          trackKey: 'k2',
        },
      ];

      const unmatched = getUnmatchedUnifiedTracks(matches);
      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].id).toBe('u1');

      const matched = getMatchedUnifiedTracks(matches);
      expect(matched).toHaveLength(1);
      expect(matched[0].track.id).toBe('m1');
      expect(matched[0].matchedSong.id).toBe('d1');

      const stats = getMatchStatistics(matches);
      expect(stats.total).toBe(2);
      expect(stats.matched).toBe(1);
      expect(stats.unmatched).toBe(1);
    });
  });
});
