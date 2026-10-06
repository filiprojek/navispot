import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SettingsModal } from '@/components/Dashboard/SettingsModal';
import { UnmatchedSongsPanel } from '@/components/Dashboard/UnmatchedSongsPanel';
import { ResultsReport } from '@/components/ResultsReport/ResultsReport';
import * as DownloaderContextModule from '@/lib/downloader/downloader-context';
import * as AuthContextModule from '@/lib/auth/auth-context';
import { DownloaderContextType } from '@/lib/downloader/downloader-context';
import { AuthContextType } from '@/types/auth-context';
import { TrackMatch } from '@/types/matching';
import { ExportResult } from '@/components/ResultsReport/types';

vi.mock('@/lib/downloader/downloader-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/downloader/downloader-context')>();
  return {
    ...actual,
    useDownloader: vi.fn(),
  };
});

vi.mock('@/lib/auth/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/auth-context')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

describe('Music Downloader UI Components (frontend-m3-clean)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const defaultDownloaderMock: DownloaderContextType = {
    config: {
      enabled: true,
      url: 'http://127.0.0.1:8787',
      apiKey: 'flacdownloader',
      format: 'flac',
      autoQueueUnmatched: false,
    },
    updateConfig: vi.fn(),
    status: {
      connected: true,
      statusText: 'Connected to FlacDownloader',
      queueCount: 3,
      active: true,
    },
    isChecking: false,
    isQueueing: false,
    checkConnection: vi.fn().mockResolvedValue({
      connected: true,
      statusText: 'Connected',
      queueCount: 3,
      active: true,
    }),
    queueTrack: vi.fn().mockResolvedValue({ success: true, nzo_id: 'nzo_123' }),
    batchQueueTracks: vi.fn().mockResolvedValue({
      total: 2,
      queued: 2,
      failed: 0,
      skipped: 0,
      items: [
        { title: 'Track 1', artist: 'Artist 1', status: 'queued', nzo_id: 'nzo_1' },
        { title: 'Track 2', artist: 'Artist 2', status: 'queued', nzo_id: 'nzo_2' },
      ],
    }),
    triggerNavidromeScan: vi.fn().mockResolvedValue({ success: true, scanning: true }),
  };

  const defaultAuthMock = {
    navidrome: {
      isConnected: true,
      credentials: { url: 'http://navidrome.local', username: 'admin', password: 'secret' },
      token: 'token123',
      clientId: 'client123',
    },
    spotify: { isAuthenticated: true, token: 'spot123' },
    appleMusic: { isAuthenticated: false },
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.mocked(DownloaderContextModule.useDownloader).mockReturnValue(defaultDownloaderMock);
    vi.mocked(AuthContextModule.useAuth).mockReturnValue(defaultAuthMock as unknown as AuthContextType);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  const emojiRegex = /\p{Extended_Pictographic}/u;

  describe('SettingsModal Downloader Tab', () => {
    it('renders the Downloader tab button and contains zero emojis', () => {
      act(() => {
        root.render(
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            layout="default"
            onLayoutChange={vi.fn()}
            forceExportPlaylists={false}
            onForceExportChange={vi.fn()}
            exportPlaylistsAsPublic={false}
            onExportPlaylistsAsPublicChange={vi.fn()}
          />
        );
      });

      const tab = container.querySelector('#settings-tab-downloader');
      expect(tab).not.toBeNull();
      expect(tab?.textContent).toContain('Downloader');
      expect(emojiRegex.test(container.textContent || '')).toBe(false);
    });

    it('switches to Downloader tab and displays controls and inputs', () => {
      act(() => {
        root.render(
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            layout="default"
            onLayoutChange={vi.fn()}
            forceExportPlaylists={false}
            onForceExportChange={vi.fn()}
            exportPlaylistsAsPublic={false}
            onExportPlaylistsAsPublicChange={vi.fn()}
          />
        );
      });

      const tab = container.querySelector('#settings-tab-downloader') as HTMLButtonElement;
      act(() => {
        tab.click();
      });

      expect(container.textContent).toContain('Music Downloader');
      expect(container.textContent).toContain('Daemon Endpoint URL');
      expect(container.textContent).toContain('Preferred Audio Format');
      expect(container.textContent).toContain('Auto-queue Unmatched Tracks');
      expect(container.textContent).toContain('Connected (3 in queue)');
      expect(emojiRegex.test(container.textContent || '')).toBe(false);
    });

    it('allows toggling downloader integration and calls updateConfig', () => {
      act(() => {
        root.render(
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            layout="default"
            onLayoutChange={vi.fn()}
            forceExportPlaylists={false}
            onForceExportChange={vi.fn()}
            exportPlaylistsAsPublic={false}
            onExportPlaylistsAsPublicChange={vi.fn()}
          />
        );
      });

      const tab = container.querySelector('#settings-tab-downloader') as HTMLButtonElement;
      act(() => {
        tab.click();
      });

      const switches = container.querySelectorAll('button[role="switch"]');
      expect(switches.length).toBeGreaterThanOrEqual(1);

      act(() => {
        (switches[0] as HTMLButtonElement).click();
      });

      expect(defaultDownloaderMock.updateConfig).toHaveBeenCalledWith({ enabled: false });
    });

    it('calls checkConnection when Test Connection is clicked', async () => {
      act(() => {
        root.render(
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            layout="default"
            onLayoutChange={vi.fn()}
            forceExportPlaylists={false}
            onForceExportChange={vi.fn()}
            exportPlaylistsAsPublic={false}
            onExportPlaylistsAsPublicChange={vi.fn()}
          />
        );
      });

      const tab = container.querySelector('#settings-tab-downloader') as HTMLButtonElement;
      act(() => {
        tab.click();
      });

      const testBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Test Connection')
      );
      expect(testBtn).toBeDefined();

      await act(async () => {
        testBtn?.click();
      });

      expect(defaultDownloaderMock.checkConnection).toHaveBeenCalled();
    });

    it('calls triggerNavidromeScan when Scan Library is clicked', async () => {
      act(() => {
        root.render(
          <SettingsModal
            isOpen={true}
            onClose={vi.fn()}
            layout="default"
            onLayoutChange={vi.fn()}
            forceExportPlaylists={false}
            onForceExportChange={vi.fn()}
            exportPlaylistsAsPublic={false}
            onExportPlaylistsAsPublicChange={vi.fn()}
          />
        );
      });

      const tab = container.querySelector('#settings-tab-downloader') as HTMLButtonElement;
      act(() => {
        tab.click();
      });

      const scanBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Scan Library')
      );
      expect(scanBtn).toBeDefined();

      await act(async () => {
        scanBtn?.click();
      });

      expect(defaultDownloaderMock.triggerNavidromeScan).toHaveBeenCalled();
      expect(container.textContent).toContain('Navidrome scan initiated.');
    });
  });

  describe('UnmatchedSongsPanel Downloader Integration', () => {
    const sampleUnmatched = [
      {
        title: 'Song A',
        album: 'Album A',
        artist: 'Artist A',
        duration: '3:45',
      },
      {
        title: 'Song B',
        album: 'Album B',
        artist: 'Artist B',
        duration: '4:20',
      },
    ];

    it('renders header button "Download All Missing" and row buttons when enabled', () => {
      act(() => {
        root.render(<UnmatchedSongsPanel unmatchedSongs={sampleUnmatched} isEmpty={false} />);
      });

      expect(container.textContent).toContain('Download All Missing (2)');
      const downloadButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Download')
      );
      // 1 in header + 2 in rows
      expect(downloadButtons.length).toBe(3);
      expect(emojiRegex.test(container.textContent || '')).toBe(false);
    });

    it('hides header action and row actions when downloader is disabled', () => {
      vi.mocked(DownloaderContextModule.useDownloader).mockReturnValue({
        ...defaultDownloaderMock,
        config: { ...defaultDownloaderMock.config, enabled: false },
      });

      act(() => {
        root.render(<UnmatchedSongsPanel unmatchedSongs={sampleUnmatched} isEmpty={false} />);
      });

      expect(container.textContent).not.toContain('Download All Missing');
      const actionHeader = Array.from(container.querySelectorAll('th')).find(
        (th) => th.textContent?.trim() === 'Action'
      );
      expect(actionHeader).toBeUndefined();
    });

    it('queues a single track when row Download button is clicked', async () => {
      act(() => {
        root.render(<UnmatchedSongsPanel unmatchedSongs={sampleUnmatched} isEmpty={false} />);
      });

      const rowButtons = Array.from(container.querySelectorAll('tbody button'));
      expect(rowButtons.length).toBe(2);

      await act(async () => {
        rowButtons[0].click();
      });

      expect(defaultDownloaderMock.queueTrack).toHaveBeenCalledWith({
        title: 'Song A',
        artist: 'Artist A',
        album: 'Album A',
      });
      expect(container.textContent).toContain('Queued');
    });

    it('queues all missing tracks when header button is clicked', async () => {
      act(() => {
        root.render(<UnmatchedSongsPanel unmatchedSongs={sampleUnmatched} isEmpty={false} />);
      });

      const headerBtn = container.querySelector('button[title="Queue all missing tracks to FlacDownloader"]') as HTMLButtonElement;
      expect(headerBtn).not.toBeNull();

      await act(async () => {
        headerBtn.click();
      });

      expect(defaultDownloaderMock.batchQueueTracks).toHaveBeenCalledWith(
        [
          { title: 'Song A', artist: 'Artist A', album: 'Album A' },
          { title: 'Song B', artist: 'Artist B', album: 'Album B' },
        ],
        expect.any(Function)
      );
    });
  });

  describe('ResultsReport Downloader Integration', () => {
    const mockMatches: TrackMatch[] = [
      {
        track: {
          id: 't1',
          title: 'Matched Song',
          artists: [{ name: 'Artist 1' }],
          album: { name: 'Album 1' },
          durationMs: 200000,
          provider: 'spotify',
        },
        status: 'matched',
        matchStrategy: 'isrc',
        matchScore: 1.0,
        trackKey: 't1',
      },
      {
        track: {
          id: 't2',
          title: 'Missing Song X',
          artists: [{ name: 'Artist X' }],
          album: { name: 'Album X' },
          durationMs: 210000,
          provider: 'spotify',
        },
        status: 'unmatched',
        matchStrategy: 'none',
        matchScore: 0,
        trackKey: 't2',
      },
    ];

    const mockResult: ExportResult = {
      playlistName: 'My Awesome Playlist',
      timestamp: new Date('2026-10-06T10:00:00Z'),
      statistics: {
        total: 2,
        matched: 1,
        unmatched: 1,
        ambiguous: 0,
        exported: 1,
        failed: 0,
      },
      matches: mockMatches,
      options: {} as unknown as ExportResult['options'],
    };

    it('renders Queue Missing button in unmatched tracks header when downloader is enabled', () => {
      act(() => {
        root.render(
          <ResultsReport
            result={mockResult}
            onExportAgain={vi.fn()}
            onBackToDashboard={vi.fn()}
          />
        );
      });

      expect(container.textContent).toContain('Queue Missing in Downloader (1)');
      expect(emojiRegex.test(container.textContent || '')).toBe(false);
    });

    it('batch queues unmatched tracks when header button is clicked in ResultsReport', async () => {
      act(() => {
        root.render(
          <ResultsReport
            result={mockResult}
            onExportAgain={vi.fn()}
            onBackToDashboard={vi.fn()}
          />
        );
      });

      const batchBtn = container.querySelector(
        'button[title="Queue all missing tracks to FlacDownloader"]'
      ) as HTMLButtonElement;
      expect(batchBtn).not.toBeNull();

      await act(async () => {
        batchBtn.click();
      });

      expect(defaultDownloaderMock.batchQueueTracks).toHaveBeenCalledWith(
        [{ title: 'Missing Song X', artist: 'Artist X', album: 'Album X' }],
        expect.any(Function)
      );
    });

    it('expands unmatched track and queues individual track via FlacDownloader', async () => {
      act(() => {
        root.render(
          <ResultsReport
            result={mockResult}
            onExportAgain={vi.fn()}
            onBackToDashboard={vi.fn()}
          />
        );
      });

      // Click to expand item
      const itemBtn = container.querySelector(
        '.border.border-gray-200 button'
      ) as HTMLButtonElement;
      expect(itemBtn).not.toBeNull();

      act(() => {
        itemBtn.click();
      });

      expect(container.textContent).toContain('Download Track');
      const downloadTrackBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Download Track')
      );
      expect(downloadTrackBtn).toBeDefined();

      await act(async () => {
        downloadTrackBtn?.click();
      });

      expect(defaultDownloaderMock.queueTrack).toHaveBeenCalledWith({
        title: 'Missing Song X',
        artist: 'Artist X',
        album: 'Album X',
      });
      expect(container.textContent).toContain('Queued in Downloader');
    });
  });
});
