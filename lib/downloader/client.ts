import {
  DownloaderConfig,
  DownloaderStatus,
  DownloaderTrack,
  DownloaderQueueItem,
  QueueTrackRequest,
  BatchQueueResult,
  BatchQueueResultItem,
  DownloaderFormat,
} from '@/types/downloader';
import { getDefaultDownloaderConfig } from './storage';
import { calculateSimilarity, stripTitleSuffix } from '@/lib/matching/fuzzy';

export interface DownloaderClientOptions {
  config?: Partial<DownloaderConfig>;
  useProxy?: boolean;
  proxyBaseUrl?: string;
}

export class DownloaderClient {
  private config: DownloaderConfig;
  private useProxy: boolean;
  private proxyBaseUrl: string;

  constructor(
    config?: Partial<DownloaderConfig>,
    options?: { useProxy?: boolean; proxyBaseUrl?: string }
  ) {
    const defaults = getDefaultDownloaderConfig();
    this.config = {
      ...defaults,
      ...config,
    };
    this.useProxy =
      options?.useProxy !== undefined
        ? options.useProxy
        : typeof window !== 'undefined';
    this.proxyBaseUrl = (options?.proxyBaseUrl || '/api/downloader').replace(/\/$/, '');
  }

  getConfig(): DownloaderConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<DownloaderConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  isProxy(): boolean {
    return this.useProxy;
  }

  private _getProxyHeaders(): Record<string, string> {
    return {
      'x-downloader-url': this.config.url,
      'x-downloader-api-key': this.config.apiKey,
    };
  }

  private _getDirectHeaders(): Record<string, string> {
    return {
      'X-Api-Key': this.config.apiKey,
    };
  }

  /**
   * Checks connection status and queue state of the downloader daemon.
   */
  async checkStatus(signal?: AbortSignal): Promise<DownloaderStatus> {
    if (this.useProxy) {
      const url = `${this.proxyBaseUrl}/status`;
      try {
        const res = await fetch(url, {
          headers: this._getProxyHeaders(),
          signal,
        });

        if (!res.ok) {
          return {
            connected: false,
            statusText: `HTTP ${res.status}: ${res.statusText}`,
            queueCount: 0,
            active: false,
            error: `HTTP error ${res.status}`,
          };
        }

        const data = await res.json();
        return {
          connected: Boolean(data.connected),
          statusText: data.statusText || (data.connected ? 'Connected' : 'Disconnected'),
          queueCount: typeof data.queueCount === 'number' ? data.queueCount : 0,
          active: Boolean(data.active),
          error: data.error,
          queue: data.queue,
          history: data.history,
        };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        return {
          connected: false,
          statusText: 'Disconnected',
          queueCount: 0,
          active: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    }

    // Direct mode
    const baseUrl = this.config.url.replace(/\/$/, '');
    try {
      let res = await fetch(`${baseUrl}/web/status`, {
        headers: this._getDirectHeaders(),
        signal,
      });

      // Fallback to SABnzbd API if /web/status is not available
      if (!res.ok) {
        res = await fetch(`${baseUrl}/sabnzbd/api?mode=queue&apikey=${encodeURIComponent(this.config.apiKey)}`, {
          headers: this._getDirectHeaders(),
          signal,
        });
      }

      if (!res.ok) {
        return {
          connected: false,
          statusText: `HTTP ${res.status}: ${res.statusText}`,
          queueCount: 0,
          active: false,
          error: `HTTP error ${res.status}`,
        };
      }

      const data = await res.json();
      const rawSlots = (data.queue?.slots || []) as Record<string, unknown>[];
      const slots: DownloaderQueueItem[] = rawSlots.map((s) => ({
        nzo_id: String(s.nzo_id || ''),
        filename: String(s.filename || s.name || ''),
        percentage:
          typeof s.percentage === 'string'
            ? parseFloat(s.percentage) || 0
            : Number(s.percentage) || 0,
        status: String(s.status || ''),
      }));

      const queueStatus = String(data.queue?.status || 'Idle');
      const isActive =
        queueStatus.toLowerCase() === 'downloading' ||
        slots.some((s) => s.status.toLowerCase() === 'downloading');

      return {
        connected: true,
        statusText: isActive ? 'Downloading' : 'Connected',
        queueCount: slots.length,
        active: isActive,
        queue: {
          status: queueStatus,
          slots,
        },
        history: {
          slots: data.history?.slots || [],
        },
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      return {
        connected: false,
        statusText: 'Disconnected',
        queueCount: 0,
        active: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Searches for tracks on Deezer via the downloader daemon.
   */
  async search(query: string, limit: number = 30, signal?: AbortSignal): Promise<DownloaderTrack[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    const url = this.useProxy
      ? `${this.proxyBaseUrl}/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`
      : `${this.config.url.replace(/\/$/, '')}/web/search?q=${encodeURIComponent(cleanQuery)}&limit=${limit}`;

    const headers: Record<string, string> = this.useProxy
      ? this._getProxyHeaders()
      : this._getDirectHeaders();

    const res = await fetch(url, { headers, signal });
    if (!res.ok) {
      throw new Error(`Search failed: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const tracks = (Array.isArray(data) ? data : data.tracks || []) as Record<string, unknown>[];

    return tracks.map((t) => ({
      id: t.id as number | string,
      title: String(t.title || ''),
      artist: String(t.artist || ''),
      album: String(t.album || ''),
      cover: typeof t.cover === 'string' ? t.cover : undefined,
      duration_sec: Number(t.duration_sec) || 0,
      duration: String(t.duration || ''),
      preview: typeof t.preview === 'string' ? t.preview : undefined,
      link: typeof t.link === 'string' ? t.link : undefined,
    }));
  }

  /**
   * Queues an individual track for download.
   */
  async queueTrack(
    req: QueueTrackRequest,
    signal?: AbortSignal
  ): Promise<{ success: boolean; nzo_id?: string; error?: string }> {
    const url = this.useProxy
      ? `${this.proxyBaseUrl}/queue`
      : `${this.config.url.replace(/\/$/, '')}/web/queue`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.useProxy ? this._getProxyHeaders() : this._getDirectHeaders()),
    };

    const payload = {
      id: req.id,
      type: req.type || 'track',
      title: req.title,
      artist: req.artist,
      album: req.album,
      format: req.format || this.config.format,
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        let errMsg = `HTTP error ${res.status}`;
        try {
          const errJson = await res.json();
          if (errJson.error) errMsg = errJson.error;
        } catch {}
        return { success: false, error: errMsg };
      }

      const data = await res.json();
      if (data.status === false || data.success === false) {
        return { success: false, error: data.error || 'Failed to queue track' };
      }

      return {
        success: true,
        nzo_id: data.nzo_id || data.nzo_ids?.[0],
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw errorOrDom(err);
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Searches for a missing track, matches the best candidate, and queues it.
   */
  async findAndQueueMissingTrack(
    track: { title: string; artist: string; album?: string; format?: DownloaderFormat },
    signal?: AbortSignal
  ): Promise<{ success: boolean; nzo_id?: string; track?: DownloaderTrack; error?: string }> {
    if (!track.title?.trim() || !track.artist?.trim()) {
      return { success: false, error: 'Missing track title or artist' };
    }

    try {
      // 1. Search for artist + title
      let results = await this.search(`${track.artist} ${track.title}`, 10, signal);

      // 2. If no results, try stripped title
      if (results.length === 0) {
        const stripped = stripTitleSuffix(track.title);
        if (stripped !== track.title) {
          results = await this.search(`${track.artist} ${stripped}`, 10, signal);
        }
      }

      // 3. Fallback to just the stripped title if still no results
      if (results.length === 0) {
        const stripped = stripTitleSuffix(track.title);
        results = await this.search(stripped, 10, signal);
      }

      if (results.length === 0) {
        return { success: false, error: 'Track not found on downloader search' };
      }

      // 4. Rank candidates by similarity
      let bestCandidate: DownloaderTrack | null = null;
      let highestScore = -1;

      for (const candidate of results) {
        const titleScore = calculateSimilarity(candidate.title, track.title);
        const artistScore = calculateSimilarity(candidate.artist, track.artist);
        const score = titleScore * 0.6 + artistScore * 0.4;

        if (score > highestScore) {
          highestScore = score;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate || highestScore < 0.4) {
        return {
          success: false,
          error: 'No matching track found with sufficient confidence',
        };
      }

      // 5. Queue the matched candidate
      const queueResult = await this.queueTrack(
        {
          id: bestCandidate.id,
          title: bestCandidate.title,
          artist: bestCandidate.artist,
          album: bestCandidate.album || track.album || '',
          format: track.format || this.config.format,
          type: 'track',
        },
        signal
      );

      if (!queueResult.success) {
        return {
          success: false,
          error: queueResult.error || 'Failed to queue track',
          track: bestCandidate,
        };
      }

      return {
        success: true,
        nzo_id: queueResult.nzo_id,
        track: bestCandidate,
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw errorOrDom(err);
      }
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * Batch queues a list of missing tracks with progress tracking.
   */
  async batchQueueMissingTracks(
    tracks: { title: string; artist: string; album?: string }[],
    optionsOrProgress?:
      | ((processed: number, total: number, song?: string) => void)
      | { onProgress?: (processed: number, total: number, song?: string) => void },
    signal?: AbortSignal
  ): Promise<BatchQueueResult> {
    const total = tracks.length;
    if (total === 0) {
      return { total: 0, queued: 0, failed: 0, skipped: 0, items: [] };
    }

    const onProgress =
      typeof optionsOrProgress === 'function'
        ? optionsOrProgress
        : optionsOrProgress?.onProgress;

    // When running via proxy without progress callback, use the server batch-queue endpoint
    if (this.useProxy && !onProgress) {
      const url = `${this.proxyBaseUrl}/batch-queue`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this._getProxyHeaders(),
          },
          body: JSON.stringify({ tracks, format: this.config.format }),
          signal,
        });

        if (res.ok) {
          return (await res.json()) as BatchQueueResult;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw errorOrDom(err);
        }
        // Fall back to sequential iteration if proxy batch fails
      }
    }

    let queued = 0;
    let failed = 0;
    let skipped = 0;
    const items: BatchQueueResultItem[] = [];

    for (let i = 0; i < tracks.length; i++) {
      if (signal?.aborted) {
        throw new DOMException('Batch queue operation cancelled', 'AbortError');
      }

      const track = tracks[i];
      if (!track.title?.trim() || !track.artist?.trim()) {
        skipped++;
        items.push({
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          status: 'failed',
          error: 'Missing title or artist',
        });
        onProgress?.(i + 1, total);
        continue;
      }

      try {
        const result = await this.findAndQueueMissingTrack(track, signal);
        if (result.success) {
          queued++;
          items.push({
            title: track.title,
            artist: track.artist,
            status: 'queued',
            nzo_id: result.nzo_id,
          });
        } else {
          const isNotFound = result.error?.toLowerCase().includes('not found');
          failed++;
          items.push({
            title: track.title,
            artist: track.artist,
            status: isNotFound ? 'not_found' : 'failed',
            error: result.error,
          });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw errorOrDom(err);
        }
        failed++;
        items.push({
          title: track.title,
          artist: track.artist,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      onProgress?.(i + 1, total);
    }

    return {
      total,
      queued,
      failed,
      skipped,
      items,
    };
  }
}

function errorOrDom(err: unknown): DOMException | Error {
  return err instanceof DOMException || err instanceof Error ? err : new Error(String(err));
}

export const downloaderClient = new DownloaderClient();
export default DownloaderClient;
