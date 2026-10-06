import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DownloaderClient } from './client';
import {
  DOWNLOADER_CONFIG_STORAGE_KEY,
  getDefaultDownloaderConfig,
  getStoredDownloaderConfig,
  saveStoredDownloaderConfig,
} from './storage';
import { NavidromeApiClient } from '@/lib/navidrome/client';

describe('Downloader Storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns default config when storage is empty', () => {
    const config = getDefaultDownloaderConfig();
    expect(config.url).toBe('http://127.0.0.1:8787');
    expect(config.apiKey).toBe('flacdownloader');
    expect(config.format).toBe('flac');
    expect(config.enabled).toBe(false);
    expect(config.autoQueueUnmatched).toBe(false);
  });

  it('retrieves and merges stored config from localStorage', () => {
    const stored = {
      enabled: true,
      url: 'http://192.168.1.100:8787',
      apiKey: 'custom-key',
      format: 'mp3_320',
      autoQueueUnmatched: true,
    };
    vi.mocked(localStorage.getItem).mockReturnValueOnce(JSON.stringify(stored));

    const config = getStoredDownloaderConfig();
    expect(config.enabled).toBe(true);
    expect(config.url).toBe('http://192.168.1.100:8787');
    expect(config.apiKey).toBe('custom-key');
    expect(config.format).toBe('mp3_320');
    expect(config.autoQueueUnmatched).toBe(true);
  });

  it('falls back to default values when localStorage contains corrupted JSON', () => {
    vi.mocked(localStorage.getItem).mockReturnValueOnce('invalid-json');

    const config = getStoredDownloaderConfig();
    expect(config.url).toBe('http://127.0.0.1:8787');
    expect(config.apiKey).toBe('flacdownloader');
  });

  it('persists downloader config to localStorage', () => {
    const configToSave = {
      enabled: true,
      url: 'http://10.0.0.5:8787',
      apiKey: 'my-token',
      format: 'flac' as const,
      autoQueueUnmatched: false,
    };

    saveStoredDownloaderConfig(configToSave);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      DOWNLOADER_CONFIG_STORAGE_KEY,
      JSON.stringify(configToSave)
    );
  });
});

describe('DownloaderClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Configuration & Modes', () => {
    it('initializes with default options and custom overrides', () => {
      const client = new DownloaderClient(
        { url: 'http://localhost:8787', apiKey: 'test-key', format: 'mp3_320' },
        { useProxy: false }
      );

      const cfg = client.getConfig();
      expect(cfg.url).toBe('http://localhost:8787');
      expect(cfg.apiKey).toBe('test-key');
      expect(cfg.format).toBe('mp3_320');
      expect(client.isProxy()).toBe(false);
    });

    it('updates config via setConfig', () => {
      const client = new DownloaderClient({}, { useProxy: false });
      client.setConfig({ enabled: true, apiKey: 'updated-key' });

      expect(client.getConfig().enabled).toBe(true);
      expect(client.getConfig().apiKey).toBe('updated-key');
    });
  });

  describe('checkStatus()', () => {
    it('returns connected status in direct mode from /web/status', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          queue: {
            status: 'Idle',
            slots: [
              {
                nzo_id: 'nzo_1',
                filename: 'Artist - Track.flac',
                percentage: '50',
                status: 'Queued',
              },
            ],
          },
          history: { slots: [] },
        }),
      });

      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader' },
        { useProxy: false }
      );

      const status = await client.checkStatus();
      expect(status.connected).toBe(true);
      expect(status.queueCount).toBe(1);
      expect(status.active).toBe(false);
      expect(status.queue?.slots[0].percentage).toBe(50);
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/web/status', {
        headers: { 'X-Api-Key': 'flacdownloader' },
        signal: undefined,
      });
    });

    it('detects active downloading in direct mode', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          queue: {
            status: 'Downloading',
            slots: [
              {
                nzo_id: 'nzo_2',
                filename: 'Active Track.flac',
                percentage: 75,
                status: 'Downloading',
              },
            ],
          },
        }),
      });

      const client = new DownloaderClient({}, { useProxy: false });
      const status = await client.checkStatus();

      expect(status.connected).toBe(true);
      expect(status.active).toBe(true);
      expect(status.statusText).toBe('Downloading');
    });

    it('falls back to sabnzbd queue API when /web/status returns non-200', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            queue: {
              status: 'Idle',
              slots: [],
            },
          }),
        });

      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader' },
        { useProxy: false }
      );

      const status = await client.checkStatus();
      expect(status.connected).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toContain('/sabnzbd/api?mode=queue');
    });

    it('handles connection failure gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Connection refused'));

      const client = new DownloaderClient({}, { useProxy: false });
      const status = await client.checkStatus();

      expect(status.connected).toBe(false);
      expect(status.statusText).toBe('Disconnected');
      expect(status.error).toContain('Connection refused');
    });

    it('uses proxy route in proxy mode', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          connected: true,
          statusText: 'Connected',
          queueCount: 2,
          active: false,
        }),
      });

      const client = new DownloaderClient(
        { url: 'http://custom-host:8787', apiKey: 'custom-key' },
        { useProxy: true }
      );

      const status = await client.checkStatus();
      expect(status.connected).toBe(true);
      expect(status.queueCount).toBe(2);
      expect(fetchMock).toHaveBeenCalledWith('/api/downloader/status', {
        headers: {
          'x-downloader-url': 'http://custom-host:8787',
          'x-downloader-api-key': 'custom-key',
        },
        signal: undefined,
      });
    });
  });

  describe('search()', () => {
    it('returns empty array for empty search query', async () => {
      const client = new DownloaderClient({}, { useProxy: false });
      const tracks = await client.search('   ');
      expect(tracks).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('searches tracks in direct mode with correct parameters', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 101,
            title: 'Bohemian Rhapsody',
            artist: 'Queen',
            album: 'A Night at the Opera',
            duration_sec: 354,
            duration: '5:54',
            link: 'https://www.deezer.com/track/101',
          },
        ],
      });

      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader' },
        { useProxy: false }
      );

      const results = await client.search('Queen Bohemian Rhapsody', 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Bohemian Rhapsody');
      expect(results[0].artist).toBe('Queen');
      expect(results[0].duration_sec).toBe(354);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:8787/web/search?q=Queen%20Bohemian%20Rhapsody&limit=10',
        {
          headers: { 'X-Api-Key': 'flacdownloader' },
          signal: undefined,
        }
      );
    });

    it('throws error when search endpoint responds with HTTP error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const client = new DownloaderClient({}, { useProxy: false });
      await expect(client.search('Test Query')).rejects.toThrow('Search failed: HTTP 500');
    });
  });

  describe('queueTrack()', () => {
    it('queues a track via direct mode', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: true,
          nzo_id: 'nzo_test_123',
          name: 'Queen - Bohemian Rhapsody',
        }),
      });

      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader', format: 'flac' },
        { useProxy: false }
      );

      const result = await client.queueTrack({
        id: 101,
        title: 'Bohemian Rhapsody',
        artist: 'Queen',
        album: 'A Night at the Opera',
      });

      expect(result.success).toBe(true);
      expect(result.nzo_id).toBe('nzo_test_123');
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8787/web/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': 'flacdownloader',
        },
        body: JSON.stringify({
          id: 101,
          type: 'track',
          title: 'Bohemian Rhapsody',
          artist: 'Queen',
          album: 'A Night at the Opera',
          format: 'flac',
        }),
        signal: undefined,
      });
    });

    it('returns error when queue responds with status false', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: false,
          error: 'Download quota exceeded',
        }),
      });

      const client = new DownloaderClient({}, { useProxy: false });
      const result = await client.queueTrack({
        id: 999,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download quota exceeded');
    });
  });

  describe('findAndQueueMissingTrack()', () => {
    it('finds best matching candidate and queues it', async () => {
      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader' },
        { useProxy: false }
      );

      // Search mock
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 201,
              title: 'Smells Like Teen Spirit',
              artist: 'Nirvana',
              album: 'Nevermind',
              duration_sec: 301,
              duration: '5:01',
            },
            {
              id: 202,
              title: 'Smells Like Teen Spirit (Live)',
              artist: 'Nirvana',
              album: 'Live at Reading',
              duration_sec: 310,
              duration: '5:10',
            },
          ],
        })
        // Queue mock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: true,
            nzo_id: 'nzo_nirvana_201',
          }),
        });

      const res = await client.findAndQueueMissingTrack({
        title: 'Smells Like Teen Spirit',
        artist: 'Nirvana',
        album: 'Nevermind',
      });

      expect(res.success).toBe(true);
      expect(res.nzo_id).toBe('nzo_nirvana_201');
      expect(res.track?.id).toBe(201);
    });

    it('retries with stripped title suffix if initial search returns empty', async () => {
      const client = new DownloaderClient({}, { useProxy: false });

      // First search with suffix: empty
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        // Second search with stripped title: match
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              id: 301,
              title: 'Hotel California',
              artist: 'Eagles',
              album: 'Hotel California',
              duration_sec: 390,
              duration: '6:30',
            },
          ],
        })
        // Queue mock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            status: true,
            nzo_id: 'nzo_eagles_301',
          }),
        });

      const res = await client.findAndQueueMissingTrack({
        title: 'Hotel California - 2013 Remaster',
        artist: 'Eagles',
      });

      expect(res.success).toBe(true);
      expect(res.nzo_id).toBe('nzo_eagles_301');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('returns error when track is not found', async () => {
      const client = new DownloaderClient({}, { useProxy: false });

      // Search returns empty
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const res = await client.findAndQueueMissingTrack({
        title: 'Nonexistent Unknown Track',
        artist: 'Ghost Artist',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Track not found');
    });

    it('returns error when track input is missing title or artist', async () => {
      const client = new DownloaderClient({}, { useProxy: false });
      const res = await client.findAndQueueMissingTrack({
        title: '',
        artist: 'Artist',
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Missing track title or artist');
    });
  });

  describe('batchQueueMissingTracks()', () => {
    it('processes batch of missing tracks and reports progress in direct mode', async () => {
      const client = new DownloaderClient({}, { useProxy: false });

      // Track 1 search + queue
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [{ id: 1, title: 'Song 1', artist: 'Artist 1' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: true, nzo_id: 'nzo_1' }),
        })
        // Track 2 search (not found)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        });

      const progressSpy = vi.fn();
      const result = await client.batchQueueMissingTracks(
        [
          { title: 'Song 1', artist: 'Artist 1' },
          { title: 'Song 2', artist: 'Artist 2' },
        ],
        progressSpy
      );

      expect(result.total).toBe(2);
      expect(result.queued).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.items[0].status).toBe('queued');
      expect(result.items[0].nzo_id).toBe('nzo_1');
      expect(result.items[1].status).toBe('not_found');
      expect(progressSpy).toHaveBeenCalledTimes(2);
      expect(progressSpy).toHaveBeenLastCalledWith(2, 2);
    });

    it('delegates to proxy batch-queue endpoint when in proxy mode without onProgress', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 2,
          queued: 2,
          failed: 0,
          skipped: 0,
          items: [
            { title: 'Track 1', artist: 'Artist 1', status: 'queued', nzo_id: 'nzo_1' },
            { title: 'Track 2', artist: 'Artist 2', status: 'queued', nzo_id: 'nzo_2' },
          ],
        }),
      });

      const client = new DownloaderClient(
        { url: 'http://127.0.0.1:8787', apiKey: 'flacdownloader' },
        { useProxy: true }
      );

      const result = await client.batchQueueMissingTracks([
        { title: 'Track 1', artist: 'Artist 1' },
        { title: 'Track 2', artist: 'Artist 2' },
      ]);

      expect(result.queued).toBe(2);
      expect(fetchMock).toHaveBeenCalledWith('/api/downloader/batch-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-downloader-url': 'http://127.0.0.1:8787',
          'x-downloader-api-key': 'flacdownloader',
        },
        body: JSON.stringify({
          tracks: [
            { title: 'Track 1', artist: 'Artist 1' },
            { title: 'Track 2', artist: 'Artist 2' },
          ],
          format: 'flac',
        }),
        signal: undefined,
      });
    });

    it('returns empty result when empty tracks array is passed', async () => {
      const client = new DownloaderClient({}, { useProxy: false });
      const result = await client.batchQueueMissingTracks([]);
      expect(result.total).toBe(0);
      expect(result.queued).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });
});

describe('NavidromeApiClient Subsonic Scan Methods', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers startScan and parses subsonic scan status response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
          scanStatus: {
            scanning: true,
            count: 4521,
          },
        },
      }),
    });

    const client = new NavidromeApiClient('http://localhost:4533', 'admin', 'password');
    const result = await client.startScan();

    expect(result.success).toBe(true);
    expect(result.scanning).toBe(true);
    expect(result.count).toBe(4521);
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/startScan');
  });

  it('handles startScan error response from Subsonic API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'failed',
          error: {
            code: 10,
            message: 'User is not authorized to start scan',
          },
        },
      }),
    });

    const client = new NavidromeApiClient('http://localhost:4533', 'admin', 'password');
    const result = await client.startScan();

    expect(result.success).toBe(false);
    expect(result.error).toBe('User is not authorized to start scan');
  });

  it('queries getScanStatus and parses subsonic response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        'subsonic-response': {
          status: 'ok',
          version: '1.16.1',
          scanStatus: {
            scanning: false,
            count: 4521,
          },
        },
      }),
    });

    const client = new NavidromeApiClient('http://localhost:4533', 'admin', 'password');
    const result = await client.getScanStatus();

    expect(result.success).toBe(true);
    expect(result.scanning).toBe(false);
    expect(result.count).toBe(4521);
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/getScanStatus');
  });
});
