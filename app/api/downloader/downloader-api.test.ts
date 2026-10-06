import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as statusHandler } from './status/route';
import { GET as searchHandler } from './search/route';
import { POST as queueHandler } from './queue/route';
import { POST as batchQueueHandler } from './batch-queue/route';
import { DownloaderClient } from '@/lib/downloader/client';

describe('Downloader API Server Proxy Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/downloader/status', () => {
    it('returns 200 with downloader status when reachable', async () => {
      vi.spyOn(DownloaderClient.prototype, 'checkStatus').mockResolvedValueOnce({
        connected: true,
        statusText: 'Connected',
        queueCount: 3,
        active: false,
        queue: {
          status: 'Idle',
          slots: [],
        },
      });

      const req = {
        headers: new Headers({
          'x-downloader-url': 'http://127.0.0.1:8787',
          'x-downloader-api-key': 'testkey',
        }),
        nextUrl: new URL('http://localhost:3000/api/downloader/status'),
      } as unknown as NextRequest;

      const response = await statusHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.connected).toBe(true);
      expect(data.statusText).toBe('Connected');
      expect(data.queueCount).toBe(3);
    });

    it('returns status object with connected: false when daemon is unreachable', async () => {
      vi.spyOn(DownloaderClient.prototype, 'checkStatus').mockResolvedValueOnce({
        connected: false,
        statusText: 'Disconnected',
        queueCount: 0,
        active: false,
        error: 'ECONNREFUSED',
      });

      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/status'),
      } as unknown as NextRequest;

      const response = await statusHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.connected).toBe(false);
      expect(data.statusText).toBe('Disconnected');
      expect(data.error).toBe('ECONNREFUSED');
    });
  });

  describe('GET /api/downloader/search', () => {
    it('returns 400 when q query parameter is missing', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/search'),
      } as unknown as NextRequest;

      const response = await searchHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Missing query parameter q');
    });

    it('returns 400 when q query parameter is only whitespace', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/search?q=%20%20'),
      } as unknown as NextRequest;

      const response = await searchHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Missing query parameter q');
    });

    it('returns 200 with tracks on successful search', async () => {
      const mockTracks = [
        {
          id: 1,
          title: 'Track One',
          artist: 'Artist One',
          album: 'Album One',
          duration_sec: 210,
          duration: '3:30',
        },
      ];
      vi.spyOn(DownloaderClient.prototype, 'search').mockResolvedValueOnce(mockTracks);

      const req = {
        headers: new Headers({
          'x-downloader-url': 'http://127.0.0.1:8787',
          'x-downloader-api-key': 'testkey',
        }),
        nextUrl: new URL('http://localhost:3000/api/downloader/search?q=Track%20One&limit=5'),
      } as unknown as NextRequest;

      const response = await searchHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveLength(1);
      expect(data[0].title).toBe('Track One');
    });

    it('returns 502 when search fails on downloader client', async () => {
      vi.spyOn(DownloaderClient.prototype, 'search').mockRejectedValueOnce(
        new Error('Downloader search offline')
      );

      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/search?q=ErrorQuery'),
      } as unknown as NextRequest;

      const response = await searchHandler(req);
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.error).toBe('Search failed');
      expect(data.details).toBe('Downloader search offline');
    });
  });

  describe('POST /api/downloader/queue', () => {
    it('returns 400 for invalid JSON body', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/queue'),
        json: async () => {
          throw new Error('Malformed JSON');
        },
      } as unknown as NextRequest;

      const response = await queueHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Invalid JSON body');
    });

    it('returns 400 when id parameter is missing', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/queue'),
        json: async () => ({
          title: 'Track',
          artist: 'Artist',
          album: 'Album',
        }),
      } as unknown as NextRequest;

      const response = await queueHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Missing id parameter');
    });

    it('returns 200 with queue result on success', async () => {
      vi.spyOn(DownloaderClient.prototype, 'queueTrack').mockResolvedValueOnce({
        success: true,
        nzo_id: 'nzo_987',
      });

      const req = {
        headers: new Headers({
          'x-downloader-url': 'http://127.0.0.1:8787',
          'x-downloader-api-key': 'testkey',
        }),
        nextUrl: new URL('http://localhost:3000/api/downloader/queue'),
        json: async () => ({
          id: 12345,
          title: 'Track',
          artist: 'Artist',
          album: 'Album',
          format: 'flac',
        }),
      } as unknown as NextRequest;

      const response = await queueHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.nzo_id).toBe('nzo_987');
    });

    it('returns 502 when queueing fails', async () => {
      vi.spyOn(DownloaderClient.prototype, 'queueTrack').mockResolvedValueOnce({
        success: false,
        error: 'Queue failed: storage full',
      });

      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/queue'),
        json: async () => ({
          id: 12345,
          title: 'Track',
          artist: 'Artist',
          album: 'Album',
        }),
      } as unknown as NextRequest;

      const response = await queueHandler(req);
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Queue failed: storage full');
    });
  });

  describe('POST /api/downloader/batch-queue', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/batch-queue'),
        json: async () => {
          throw new Error('Invalid JSON');
        },
      } as unknown as NextRequest;

      const response = await batchQueueHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Invalid JSON body');
    });

    it('returns 400 when tracks is not an array', async () => {
      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/batch-queue'),
        json: async () => ({
          tracks: 'not-an-array',
        }),
      } as unknown as NextRequest;

      const response = await batchQueueHandler(req);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toBe('Invalid tracks array');
    });

    it('returns 200 with batch result on success', async () => {
      vi.spyOn(DownloaderClient.prototype, 'batchQueueMissingTracks').mockResolvedValueOnce({
        total: 1,
        queued: 1,
        failed: 0,
        skipped: 0,
        items: [
          {
            title: 'Song',
            artist: 'Artist',
            status: 'queued',
            nzo_id: 'nzo_batch_1',
          },
        ],
      });

      const req = {
        headers: new Headers({
          'x-downloader-url': 'http://127.0.0.1:8787',
          'x-downloader-api-key': 'flacdownloader',
        }),
        nextUrl: new URL('http://localhost:3000/api/downloader/batch-queue'),
        json: async () => ({
          tracks: [{ title: 'Song', artist: 'Artist' }],
          format: 'flac',
        }),
      } as unknown as NextRequest;

      const response = await batchQueueHandler(req);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.total).toBe(1);
      expect(data.queued).toBe(1);
      expect(data.items[0].nzo_id).toBe('nzo_batch_1');
    });

    it('returns 502 when batchQueueMissingTracks throws', async () => {
      vi.spyOn(DownloaderClient.prototype, 'batchQueueMissingTracks').mockRejectedValueOnce(
        new Error('Unexpected batch failure')
      );

      const req = {
        headers: new Headers(),
        nextUrl: new URL('http://localhost:3000/api/downloader/batch-queue'),
        json: async () => ({
          tracks: [{ title: 'Song', artist: 'Artist' }],
        }),
      } as unknown as NextRequest;

      const response = await batchQueueHandler(req);
      expect(response.status).toBe(502);

      const data = await response.json();
      expect(data.error).toBe('Batch queue failed');
      expect(data.details).toBe('Unexpected batch failure');
    });
  });
});
