'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  DownloaderConfig,
  DownloaderStatus,
  BatchQueueResult,
  DownloaderFormat,
} from '@/types/downloader';
import {
  getStoredDownloaderConfig,
  saveStoredDownloaderConfig,
} from './storage';
import { downloaderClient } from './client';
import { useAuth } from '@/lib/auth/auth-context';
import { NavidromeApiClient } from '@/lib/navidrome/client';

export interface DownloaderContextType {
  config: DownloaderConfig;
  updateConfig: (updates: Partial<DownloaderConfig>) => void;
  status: DownloaderStatus | null;
  isChecking: boolean;
  isQueueing: boolean;
  checkConnection: (overrideConfig?: Partial<DownloaderConfig>) => Promise<DownloaderStatus>;
  queueTrack: (
    track: { id?: string | number; title: string; artist: string; album?: string; format?: DownloaderFormat }
  ) => Promise<{ success: boolean; nzo_id?: string; error?: string }>;
  batchQueueTracks: (
    tracks: { title: string; artist: string; album?: string }[],
    onProgress?: (current: number, total: number, song: string) => void
  ) => Promise<BatchQueueResult>;
  triggerNavidromeScan: () => Promise<{ success: boolean; scanning?: boolean; count?: number; error?: string }>;
}

const DownloaderContext = createContext<DownloaderContextType | undefined>(undefined);

export function DownloaderProvider({ children }: { children: React.ReactNode }) {
  const { navidrome } = useAuth();
  const [config, setConfigState] = useState<DownloaderConfig>(() => getStoredDownloaderConfig());
  const [status, setStatus] = useState<DownloaderStatus | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isQueueing, setIsQueueing] = useState<boolean>(false);

  useEffect(() => {
    downloaderClient.setConfig(config);
  }, [config]);

  const updateConfig = useCallback((updates: Partial<DownloaderConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...updates };
      saveStoredDownloaderConfig(next);
      downloaderClient.setConfig(next);
      return next;
    });
  }, []);

  const checkConnection = useCallback(
    async (overrideConfig?: Partial<DownloaderConfig>): Promise<DownloaderStatus> => {
      setIsChecking(true);
      try {
        const clientConfig = overrideConfig ? { ...config, ...overrideConfig } : config;
        const tempClient = downloaderClient;
        if (overrideConfig) {
          tempClient.setConfig(clientConfig);
        }
        const result = await tempClient.checkStatus();
        setStatus(result);
        return result;
      } catch (err) {
        const errorStatus: DownloaderStatus = {
          connected: false,
          statusText: err instanceof Error ? err.message : 'Connection failed',
          queueCount: 0,
          active: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
        setStatus(errorStatus);
        return errorStatus;
      } finally {
        setIsChecking(false);
      }
    },
    [config]
  );

  const queueTrack = useCallback(
    async (track: {
      id?: string | number;
      title: string;
      artist: string;
      album?: string;
      format?: DownloaderFormat;
    }): Promise<{ success: boolean; nzo_id?: string; error?: string }> => {
      if (!config.enabled) {
        return { success: false, error: 'Music Downloader integration is disabled' };
      }
      setIsQueueing(true);
      try {
        if (track.id) {
          return await downloaderClient.queueTrack({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album || '',
            format: track.format || config.format,
          });
        }
        const res = await downloaderClient.findAndQueueMissingTrack({
          title: track.title,
          artist: track.artist,
          album: track.album,
          format: track.format || config.format,
        });
        return {
          success: res.success,
          nzo_id: res.nzo_id,
          error: res.error,
        };
      } finally {
        setIsQueueing(false);
      }
    },
    [config]
  );

  const batchQueueTracks = useCallback(
    async (
      tracks: { title: string; artist: string; album?: string }[],
      onProgress?: (current: number, total: number, song: string) => void
    ): Promise<BatchQueueResult> => {
      if (!config.enabled) {
        return {
          total: tracks.length,
          queued: 0,
          failed: tracks.length,
          skipped: 0,
          items: tracks.map((t) => ({
            title: t.title,
            artist: t.artist,
            status: 'failed',
            error: 'Downloader disabled',
          })),
        };
      }
      setIsQueueing(true);
      try {
        return await downloaderClient.batchQueueMissingTracks(
          tracks,
          onProgress ? (c, t, s) => onProgress(c, t, s || '') : undefined
        );
      } finally {
        setIsQueueing(false);
      }
    },
    [config]
  );

  const triggerNavidromeScan = useCallback(async () => {
    if (!navidrome.credentials || !navidrome.isConnected) {
      return { success: false, error: 'Navidrome not connected' };
    }
    try {
      const client = new NavidromeApiClient(
        navidrome.credentials.url,
        navidrome.credentials.username,
        navidrome.credentials.password,
        navidrome.token || undefined,
        navidrome.clientId || undefined
      );
      return await client.startScan();
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Scan request failed',
      };
    }
  }, [navidrome]);

  const value = useMemo(
    () => ({
      config,
      updateConfig,
      status,
      isChecking,
      isQueueing,
      checkConnection,
      queueTrack,
      batchQueueTracks,
      triggerNavidromeScan,
    }),
    [
      config,
      updateConfig,
      status,
      isChecking,
      isQueueing,
      checkConnection,
      queueTrack,
      batchQueueTracks,
      triggerNavidromeScan,
    ]
  );

  return <DownloaderContext.Provider value={value}>{children}</DownloaderContext.Provider>;
}

export function useDownloader(): DownloaderContextType {
  const context = useContext(DownloaderContext);
  if (!context) {
    throw new Error('useDownloader must be used within a DownloaderProvider');
  }
  return context;
}
