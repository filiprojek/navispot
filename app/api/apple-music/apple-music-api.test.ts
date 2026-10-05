import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as publicPlaylistHandler } from './public-playlist/route';
import { GET as developerTokenHandler } from './developer-token/route';
import * as tokenManager from '@/lib/apple-music/token-manager';
import { AppleMusicClient, AppleMusicApiError } from '@/lib/apple-music/client';

describe('Apple Music API Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/apple-music/developer-token', () => {
    it('returns 503 when developer token is not configured', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue(null);

      const response = await developerTokenHandler();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error.code).toBe('not_configured');
    });

    it('returns 200 with developerToken when configured', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue('valid-dev-token');

      const response = await developerTokenHandler();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.developerToken).toBe('valid-dev-token');
    });
  });

  describe('POST /api/apple-music/public-playlist', () => {
    it('returns 400 for invalid JSON body', async () => {
      const req = {
        json: async () => {
          throw new Error('invalid json');
        },
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe('invalid_url');
    });

    it('returns 400 for invalid or non-Apple-Music URL', async () => {
      const req = {
        json: async () => ({ url: 'https://open.spotify.com/playlist/12345' }),
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error.code).toBe('invalid_url');
    });

    it('returns 503 if developer token is not configured on server', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue(null);

      const req = {
        json: async () => ({
          url: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
        }),
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.error.code).toBe('apple_music_not_configured');
    });

    it('returns 200 with unified playlist and tracks on success', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue('mock-dev-token');

      vi.spyOn(AppleMusicClient.prototype, 'getCatalogPlaylist').mockResolvedValueOnce({
        playlist: {
          id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
          type: 'playlists',
          attributes: {
            name: "Today's Hits",
            curatorName: 'Apple Music',
          },
        },
        tracks: [
          {
            id: '1001',
            type: 'songs',
            attributes: {
              name: 'Hit Song',
              artistName: 'Top Artist',
              durationInMillis: 180000,
            },
          },
        ],
      });

      const req = {
        json: async () => ({
          url: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
        }),
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.playlist.id).toBe('pl.f4d106fed2bd41149aaacabb233eb5eb');
      expect(data.playlist.name).toBe("Today's Hits");
      expect(data.tracks).toHaveLength(1);
      expect(data.tracks[0].title).toBe('Hit Song');
      expect(data.tracks[0].provider).toBe('apple-music');
    });

    it('returns 404 when playlist does not exist in catalog', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue('mock-dev-token');
      vi.spyOn(AppleMusicClient.prototype, 'getCatalogPlaylist').mockRejectedValueOnce(
        new AppleMusicApiError(404, 'Not found')
      );

      const req = {
        json: async () => ({
          url: 'https://music.apple.com/us/playlist/missing/pl.missing',
        }),
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error.code).toBe('private_or_missing');
    });

    it('returns 502 when Apple Music returns 401 unauthorized', async () => {
      vi.spyOn(tokenManager, 'getDeveloperToken').mockReturnValue('mock-dev-token');
      vi.spyOn(AppleMusicClient.prototype, 'getCatalogPlaylist').mockRejectedValueOnce(
        new AppleMusicApiError(401, 'Unauthorized')
      );

      const req = {
        json: async () => ({
          url: 'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb',
        }),
      } as unknown as NextRequest;

      const response = await publicPlaylistHandler(req);
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.error.code).toBe('apple_music_error');
    });
  });
});
