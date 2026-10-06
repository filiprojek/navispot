export type DownloaderFormat = 'flac' | 'mp3_320' | 'mp3_128';

export interface DownloaderConfig {
  enabled: boolean;
  url: string;
  apiKey: string;
  format: DownloaderFormat;
  autoQueueUnmatched: boolean;
}

export interface DownloaderTrack {
  id: number | string;
  title: string;
  artist: string;
  album: string;
  cover?: string;
  duration_sec: number;
  duration: string;
  preview?: string;
  link?: string;
}

export interface DownloaderQueueItem {
  nzo_id: string;
  filename: string;
  percentage: number;
  status: string;
}

export interface DownloaderStatus {
  connected: boolean;
  statusText: string;
  queueCount: number;
  active: boolean;
  error?: string;
  queue?: {
    status: string;
    slots: DownloaderQueueItem[];
  };
  history?: {
    slots: Record<string, unknown>[];
  };
}

export interface QueueTrackRequest {
  id: number | string;
  title: string;
  artist: string;
  album: string;
  format?: DownloaderFormat;
  type?: 'track' | 'album';
}

export interface BatchQueueResultItem {
  title: string;
  artist: string;
  status: 'queued' | 'not_found' | 'failed';
  nzo_id?: string;
  error?: string;
}

export interface BatchQueueResult {
  total: number;
  queued: number;
  failed: number;
  skipped: number;
  items: BatchQueueResultItem[];
}
