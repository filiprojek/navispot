import { DownloaderConfig, DownloaderFormat } from '@/types/downloader';

export const DOWNLOADER_CONFIG_STORAGE_KEY = 'navispot_downloader_config';

export function getDefaultDownloaderConfig(): DownloaderConfig {
  return {
    enabled: process.env.NEXT_PUBLIC_DOWNLOADER_ENABLED === 'true' || false,
    url: process.env.NEXT_PUBLIC_DOWNLOADER_URL || 'http://127.0.0.1:8787',
    apiKey: process.env.NEXT_PUBLIC_DOWNLOADER_API_KEY || 'flacdownloader',
    format: (process.env.NEXT_PUBLIC_DOWNLOADER_FORMAT as DownloaderFormat) || 'flac',
    autoQueueUnmatched: process.env.NEXT_PUBLIC_DOWNLOADER_AUTO_QUEUE === 'true' || false,
  };
}

export function getStoredDownloaderConfig(): DownloaderConfig {
  const defaults = getDefaultDownloaderConfig();
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(DOWNLOADER_CONFIG_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : defaults.enabled,
      url: typeof parsed.url === 'string' && parsed.url.trim() ? parsed.url.trim() : defaults.url,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : defaults.apiKey,
      format: (['flac', 'mp3_320', 'mp3_128'].includes(parsed.format)
        ? parsed.format
        : defaults.format) as DownloaderFormat,
      autoQueueUnmatched:
        typeof parsed.autoQueueUnmatched === 'boolean'
          ? parsed.autoQueueUnmatched
          : defaults.autoQueueUnmatched,
    };
  } catch {
    return defaults;
  }
}

export function saveStoredDownloaderConfig(config: DownloaderConfig): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DOWNLOADER_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('[storage] failed to save downloader config:', err);
  }
}
