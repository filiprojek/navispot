'use client';

import React, { useState } from 'react';
import { useDownloader } from '@/lib/downloader/downloader-context';
import { Download, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export interface UnmatchedSong {
  title: string;
  album: string;
  artist: string;
  duration: string;
}

interface UnmatchedSongsPanelProps {
  unmatchedSongs: UnmatchedSong[];
  isEmpty: boolean;
}

export function UnmatchedSongsPanel({ unmatchedSongs, isEmpty }: UnmatchedSongsPanelProps) {
  const { config, queueTrack, batchQueueTracks } = useDownloader();
  const [trackStatus, setTrackStatus] = useState<Record<string, 'queued' | 'loading' | 'failed'>>({});
  const [batchProgress, setBatchProgress] = useState<{
    running: boolean;
    current: number;
    total: number;
  } | null>(null);

  const getSongKey = (song: UnmatchedSong) => `${song.artist}___${song.title}`;

  const handleDownloadSingle = async (song: UnmatchedSong) => {
    const key = getSongKey(song);
    setTrackStatus((prev) => ({ ...prev, [key]: 'loading' }));
    try {
      const res = await queueTrack({
        title: song.title,
        artist: song.artist,
        album: song.album,
      });
      if (res.success) {
        setTrackStatus((prev) => ({ ...prev, [key]: 'queued' }));
      } else {
        setTrackStatus((prev) => ({ ...prev, [key]: 'failed' }));
      }
    } catch {
      setTrackStatus((prev) => ({ ...prev, [key]: 'failed' }));
    }
  };

  const handleDownloadAll = async () => {
    if (unmatchedSongs.length === 0 || batchProgress?.running) return;
    setBatchProgress({ running: true, current: 0, total: unmatchedSongs.length });

    try {
      await batchQueueTracks(
        unmatchedSongs.map((s) => ({
          title: s.title,
          artist: s.artist,
          album: s.album,
        })),
        (current, total, currentSong) => {
          setBatchProgress({ running: true, current, total });
          if (currentSong) {
            const found = unmatchedSongs.find(
              (s) => `${s.artist} - ${s.title}`.toLowerCase() === currentSong.toLowerCase()
            );
            if (found) {
              setTrackStatus((prev) => ({ ...prev, [getSongKey(found)]: 'queued' }));
            }
          }
        }
      );

      // Mark all as queued
      const allQueued: Record<string, 'queued'> = {};
      unmatchedSongs.forEach((s) => {
        allQueued[getSongKey(s)] = 'queued';
      });
      setTrackStatus((prev) => ({ ...prev, ...allQueued }));
    } finally {
      setBatchProgress(null);
    }
  };

  if (isEmpty) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col h-full">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Unmatched Songs
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center flex-1">
          <svg
            className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
            />
          </svg>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
            No Playlist Selected
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Select a playlist from left panel to view unmatched songs.
          </p>
        </div>
      </div>
    );
  }

  if (unmatchedSongs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col h-full">
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Unmatched Songs
          </h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center flex-1">
          <svg
            className="w-12 h-12 text-green-300 dark:text-green-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">
            All Songs Matched!
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No unmatched songs found for this playlist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Unmatched Songs ({unmatchedSongs.length})
        </h2>

        {config.enabled && (
          <button
            onClick={handleDownloadAll}
            disabled={batchProgress?.running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Queue all missing tracks to FlacDownloader"
          >
            {batchProgress?.running ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>
                  Queueing ({batchProgress.current}/{batchProgress.total})...
                </span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                <span>Download All Missing ({unmatchedSongs.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 sticky top-0">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[35%]">
                Title
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[20%]">
                Album
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[20%]">
                Artist
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[10%]">
                Duration
              </th>
              {config.enabled && (
                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 w-[15%]">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {unmatchedSongs.map((song, index) => {
              const key = getSongKey(song);
              const status = trackStatus[key];

              return (
                <tr
                  key={index}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]" title={song.title}>
                    {song.title}
                  </td>
                  <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[120px]" title={song.album}>
                    {song.album}
                  </td>
                  <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[120px]" title={song.artist}>
                    {song.artist}
                  </td>
                  <td className="px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {song.duration}
                  </td>
                  {config.enabled && (
                    <td className="px-4 py-2 text-right text-sm">
                      {status === 'queued' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Queued
                        </span>
                      ) : status === 'loading' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Queueing...
                        </span>
                      ) : status === 'failed' ? (
                        <button
                          onClick={() => handleDownloadSingle(song)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer transition-colors"
                          title="Retry queueing"
                        >
                          <AlertCircle className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownloadSingle(song)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                          title="Download track via FlacDownloader"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

