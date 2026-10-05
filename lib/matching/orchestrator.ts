import { SpotifyTrack } from '@/types/spotify';
import { NavidromeSong, NavidromeNativeSong } from '@/types/navidrome';
import { TrackMatch, MatchStrategy, MatchStatus } from '@/types/matching';
import {
  UnifiedTrack,
  DestinationMatchCandidate,
  DestinationProvider,
} from '@/types/provider';
import { NavidromeApiClient } from '@/lib/navidrome/client';
import { matchByStrict, matchUnifiedCandidateStrict } from './strict-matcher';
import {
  findBestMatch,
  findBestUnifiedMatch,
  normalizeTitle,
  normalizeArtistName,
} from './fuzzy';
import { trackKey as getTrackKey } from '@/lib/spotify/track-identity';
import { toUnifiedTrack, spotifyTrackFromUnified } from '@/lib/providers/spotify-adapter';
import { toDestinationMatchCandidate } from '@/lib/providers/navidrome-adapter';

export interface MatchingOrchestratorOptions {
  enableISRC: boolean;
  enableFuzzy: boolean;
  enableStrict: boolean;
  fuzzyThreshold: number;
  maxSearchResults: number;
}

export const defaultMatchingOptions: MatchingOrchestratorOptions = {
  enableISRC: true,
  enableFuzzy: true,
  enableStrict: true,
  fuzzyThreshold: 0.8,
  maxSearchResults: 500,
};

export interface MatchingStrategyResult {
  strategy: MatchStrategy;
  matched: boolean;
  ambiguous: boolean;
  navidromeSong?: NavidromeSong;
  candidates?: DestinationMatchCandidate[];
  score: number;
}

export interface OrchestratedMatchResult {
  spotifyTrack: SpotifyTrack;
  strategyResults: MatchingStrategyResult[];
  finalMatch: MatchingStrategyResult;
  overallStatus: MatchStatus;
}

export function candidateToNavidromeSong(candidate?: DestinationMatchCandidate): NavidromeSong | undefined {
  if (!candidate) return undefined;
  if (candidate.raw && typeof candidate.raw === 'object' && 'id' in candidate.raw && 'duration' in candidate.raw) {
    return candidate.raw as NavidromeSong;
  }
  return {
    id: candidate.id,
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album,
    duration: Math.round(candidate.durationMs / 1000),
    isrc: candidate.isrc ? [candidate.isrc] : undefined,
  };
}

export function trackToSpotifyTrack(track: UnifiedTrack): SpotifyTrack {
  if (track.raw && typeof track.raw === 'object' && 'external_ids' in track.raw) {
    return track.raw as SpotifyTrack;
  }
  return spotifyTrackFromUnified(track);
}

export function getUnifiedTrackKey(track: UnifiedTrack): string {
  if (track.uri) return track.uri;
  if (track.id) {
    if (track.provider === 'spotify') return `spotify:track:${track.id}`;
    return `${track.provider}:track:${track.id}`;
  }
  const artistNames = (track.artists || [])
    .map((a) => a.name)
    .sort()
    .join(',');
  const fingerprint = [
    track.title || '',
    artistNames,
    track.album?.name || '',
    track.durationMs?.toString() || '0',
  ].join('|');
  return `local:${track.provider || 'unified'}:${fingerprint}`;
}

export function buildTrackMatch(params: {
  track: UnifiedTrack;
  matchedSong?: DestinationMatchCandidate;
  matchScore: number;
  matchStrategy: MatchStrategy;
  status: MatchStatus;
  candidates?: DestinationMatchCandidate[];
  trackKey: string;
  entryKey?: string;
}): TrackMatch {
  const { track, matchedSong, matchScore, matchStrategy, status, candidates, trackKey, entryKey } = params;

  const spotifyTrack: SpotifyTrack =
    track.provider === 'spotify' && track.raw && typeof track.raw === 'object' && 'external_ids' in track.raw
      ? (track.raw as SpotifyTrack)
      : spotifyTrackFromUnified(track);

  const navidromeSong: NavidromeSong | undefined = candidateToNavidromeSong(matchedSong);

  return {
    track,
    spotifyTrack,
    matchedSong,
    navidromeSong,
    matchScore,
    matchStrategy,
    status,
    candidates,
    trackKey,
    entryKey,
  };
}

export function convertNativeSongToNavidromeSong(nativeSong: NavidromeNativeSong): NavidromeSong {
  return {
    id: nativeSong.id,
    title: nativeSong.title,
    artist: nativeSong.artist,
    album: nativeSong.album,
    duration: nativeSong.duration,
    isrc: nativeSong.tags?.isrc || nativeSong.isrc,
  };
}

export async function matchUnifiedTrack(
  destination: DestinationProvider,
  track: UnifiedTrack,
  options: Partial<MatchingOrchestratorOptions> = {},
  signal?: AbortSignal
): Promise<TrackMatch> {
  if (!track || !track.title) {
    const tk = track ? getUnifiedTrackKey(track) : 'unknown';
    return buildTrackMatch({
      track: track || ({ id: 'unknown', title: '', artists: [], album: { name: '' }, durationMs: 0, provider: destination.id } as UnifiedTrack),
      matchedSong: undefined,
      matchStrategy: 'none',
      matchScore: 0,
      status: 'unmatched',
      trackKey: tk,
    });
  }

  const tk = getUnifiedTrackKey(track);
  const opts: MatchingOrchestratorOptions = { ...defaultMatchingOptions, ...options };

  // 1. ISRC Search
  if (opts.enableISRC && track.isrc) {
    try {
      const isrcCandidates = await destination.searchByIsrc(track.isrc, signal);
      if (isrcCandidates && isrcCandidates.length > 0) {
        const exact = isrcCandidates.find(
          (c) => c.isrc && c.isrc.toLowerCase() === track.isrc!.toLowerCase()
        );
        if (exact) {
          return buildTrackMatch({
            track,
            matchedSong: exact,
            matchStrategy: 'isrc',
            matchScore: 1,
            status: 'matched',
            trackKey: tk,
          });
        }

        const normTrackTitle = normalizeTitle(track.title);
        const normTrackArtists = (track.artists || []).map((a) => normalizeArtistName(a.name));

        const variantMatches = isrcCandidates.filter((cand) => {
          if (normalizeTitle(cand.title) !== normTrackTitle) return false;
          if (normTrackArtists.length > 0) {
            const candArtist = normalizeArtistName(cand.artist);
            const artistOverlaps = normTrackArtists.some(
              (a) => a === candArtist || candArtist.includes(a) || a.includes(candArtist)
            );
            if (!artistOverlaps) return false;
          }
          if (cand.durationMs && track.durationMs) {
            return Math.abs(cand.durationMs - track.durationMs) < 3000;
          }
          return true;
        });

        if (variantMatches.length === 1) {
          return buildTrackMatch({
            track,
            matchedSong: variantMatches[0],
            matchStrategy: 'isrc',
            matchScore: 1,
            status: 'matched',
            trackKey: tk,
          });
        }

        if (variantMatches.length > 1) {
          const allSame = variantMatches.every(
            (m) => m.title === variantMatches[0].title && m.artist === variantMatches[0].artist
          );
          if (allSame) {
            return buildTrackMatch({
              track,
              matchedSong: variantMatches[0],
              matchStrategy: 'isrc',
              matchScore: 1,
              status: 'matched',
              trackKey: tk,
            });
          }
        }

        if (isrcCandidates.length === 1) {
          return buildTrackMatch({
            track,
            matchedSong: isrcCandidates[0],
            matchStrategy: 'isrc',
            matchScore: 1,
            status: 'matched',
            trackKey: tk,
          });
        }
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  // 2. Query search candidates
  let candidates: DestinationMatchCandidate[] = [];
  try {
    const artist = track.artists && track.artists[0] ? track.artists[0].name : undefined;
    candidates = await destination.searchByQuery({ title: track.title, artist }, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    candidates = [];
  }

  // Check ISRC against query candidates if track has ISRC
  if (opts.enableISRC && track.isrc && candidates.length > 0) {
    const isrcMatch = candidates.find(
      (c) => c.isrc && c.isrc.toLowerCase() === track.isrc!.toLowerCase()
    );
    if (isrcMatch) {
      return buildTrackMatch({
        track,
        matchedSong: isrcMatch,
        matchStrategy: 'isrc',
        matchScore: 1,
        status: 'matched',
        trackKey: tk,
      });
    }

    const normTrackTitle = normalizeTitle(track.title);
    const normTrackArtists = (track.artists || []).map((a) => normalizeArtistName(a.name));

    const variantMatches = candidates.filter((cand) => {
      if (normalizeTitle(cand.title) !== normTrackTitle) return false;
      if (normTrackArtists.length > 0) {
        const candArtist = normalizeArtistName(cand.artist);
        const artistOverlaps = normTrackArtists.some(
          (a) => a === candArtist || candArtist.includes(a) || a.includes(candArtist)
        );
        if (!artistOverlaps) return false;
      }
      if (cand.durationMs && track.durationMs) {
        return Math.abs(cand.durationMs - track.durationMs) < 3000;
      }
      return true;
    });

    if (variantMatches.length === 1) {
      return buildTrackMatch({
        track,
        matchedSong: variantMatches[0],
        matchStrategy: 'isrc',
        matchScore: 1,
        status: 'matched',
        trackKey: tk,
      });
    }

    if (variantMatches.length > 1) {
      const allSame = variantMatches.every(
        (m) => m.title === variantMatches[0].title && m.artist === variantMatches[0].artist
      );
      if (allSame) {
        return buildTrackMatch({
          track,
          matchedSong: variantMatches[0],
          matchStrategy: 'isrc',
          matchScore: 1,
          status: 'matched',
          trackKey: tk,
        });
      }
    }
  }

  // 3. Strict Matching
  let strictAmbiguousCandidates: DestinationMatchCandidate[] | undefined;
  if (opts.enableStrict) {
    const strictResult = matchUnifiedCandidateStrict(track, candidates);
    if (strictResult.status === 'matched' && strictResult.matchedCandidate) {
      return buildTrackMatch({
        track,
        matchedSong: strictResult.matchedCandidate,
        matchStrategy: 'strict',
        matchScore: 1,
        status: 'matched',
        trackKey: tk,
      });
    }
    if (strictResult.status === 'ambiguous') {
      strictAmbiguousCandidates = strictResult.candidates;
    }
  }

  // 4. Fuzzy Matching
  if (opts.enableFuzzy) {
    const fuzzyResult = findBestUnifiedMatch(track, candidates, opts.fuzzyThreshold);
    if (fuzzyResult.bestMatch && !fuzzyResult.hasAmbiguous) {
      return buildTrackMatch({
        track,
        matchedSong: fuzzyResult.bestMatch,
        matchStrategy: 'fuzzy',
        matchScore: fuzzyResult.score,
        status: 'matched',
        candidates: fuzzyResult.candidates,
        trackKey: tk,
      });
    }

    if (fuzzyResult.hasAmbiguous) {
      return buildTrackMatch({
        track,
        matchedSong: fuzzyResult.bestMatch,
        matchStrategy: 'fuzzy',
        matchScore: fuzzyResult.score,
        status: 'ambiguous',
        candidates: fuzzyResult.candidates,
        trackKey: tk,
      });
    }
  }

  if (strictAmbiguousCandidates && strictAmbiguousCandidates.length > 0) {
    return buildTrackMatch({
      track,
      matchedSong: strictAmbiguousCandidates[0],
      matchStrategy: 'strict',
      matchScore: 0,
      status: 'ambiguous',
      candidates: strictAmbiguousCandidates,
      trackKey: tk,
    });
  }

  return buildTrackMatch({
    track,
    matchedSong: undefined,
    matchStrategy: 'none',
    matchScore: 0,
    status: 'unmatched',
    trackKey: tk,
  });
}

export async function matchUnifiedTracks(
  destination: DestinationProvider,
  tracks: UnifiedTrack[],
  options: Partial<MatchingOrchestratorOptions> = {},
  signal?: AbortSignal
): Promise<TrackMatch[]> {
  const results: TrackMatch[] = [];

  for (const track of tracks) {
    if (signal?.aborted) {
      throw new DOMException('Export was cancelled', 'AbortError');
    }

    try {
      const match = await matchUnifiedTrack(destination, track, options, signal);
      results.push(match);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      console.error('Error matching track:', {
        track,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push(
        buildTrackMatch({
          track,
          matchedSong: undefined,
          matchStrategy: 'none',
          matchScore: 0,
          status: 'unmatched',
          trackKey: getUnifiedTrackKey(track),
        })
      );
    }
  }

  return results;
}


export async function matchTrack(
  client: NavidromeApiClient,
  spotifyTrack: SpotifyTrack,
  options: Partial<MatchingOrchestratorOptions> = {},
  signal?: AbortSignal
): Promise<TrackMatch> {
  if (!spotifyTrack || !spotifyTrack.name) {
    const tk = spotifyTrack ? getTrackKey(spotifyTrack) : 'unknown';
    console.warn("Invalid Spotify track encountered:", {
      track: spotifyTrack,
      hasName: spotifyTrack?.name ? true : false,
      id: spotifyTrack?.id,
      artists: spotifyTrack?.artists,
    });
    return {
      track: spotifyTrack ? toUnifiedTrack(spotifyTrack) : ({ id: 'unknown', title: '', artists: [], album: { name: '' }, durationMs: 0, provider: 'spotify' } as UnifiedTrack),
      spotifyTrack: spotifyTrack || ({} as SpotifyTrack),
      navidromeSong: undefined,
      matchedSong: undefined,
      matchStrategy: "none",
      matchScore: 0,
      status: "unmatched",
      trackKey: tk,
    };
  }

  const trackTk = getTrackKey(spotifyTrack);
  const unifiedTrack = toUnifiedTrack(spotifyTrack);

  const opts: MatchingOrchestratorOptions = { ...defaultMatchingOptions, ...options };
  const strategyResults: MatchingStrategyResult[] = [];

  const trackTitle = spotifyTrack.name;

  let candidates: NavidromeSong[] = [];
  let nativeCandidates: NavidromeNativeSong[] = [];

  nativeCandidates = await client.searchByTitle(trackTitle, opts.maxSearchResults, signal);

  if (nativeCandidates.length > 50 && spotifyTrack.artists?.length > 0) {
    const narrowed = await client.searchByTitleAndArtist(
      trackTitle,
      spotifyTrack.artists[0].name,
      opts.maxSearchResults,
      signal,
    );
    if (narrowed.length > 0) {
      nativeCandidates = narrowed;
    }
  }

  candidates = nativeCandidates.map(convertNativeSongToNavidromeSong);

  const spotifyDurationSec = spotifyTrack.duration_ms / 1000;

  if (opts.enableISRC && spotifyTrack.external_ids?.isrc) {
    const isrc = spotifyTrack.external_ids.isrc;
    const isrcMatch = candidates.find((song) => song.isrc?.includes(isrc));

    if (isrcMatch) {
      return {
        track: unifiedTrack,
        spotifyTrack,
        navidromeSong: isrcMatch,
        matchedSong: toDestinationMatchCandidate(isrcMatch),
        matchStrategy: 'isrc',
        matchScore: 1,
        status: 'matched',
        trackKey: trackTk,
      };
    }

    const normalizedSpotifyTitle = normalizeTitle(spotifyTrack.name);
    const normalizedSpotifyArtists = spotifyTrack.artists.map((a) =>
      normalizeArtistName(a.name)
    );

    const variantMatches = candidates.filter((song) => {
      if (normalizeTitle(song.title) !== normalizedSpotifyTitle) return false;

      const songArtist = normalizeArtistName(song.artist);
      const artistOverlaps = normalizedSpotifyArtists.some(
        (a) => a === songArtist || songArtist.includes(a) || a.includes(songArtist)
      );
      if (!artistOverlaps) return false;

      return Math.abs(song.duration - spotifyDurationSec) < 2;
    });

    if (variantMatches.length >= 1) {
      const allSameSong = variantMatches.every(
        (m) => m.title === variantMatches[0].title && m.artist === variantMatches[0].artist
      );

      if (variantMatches.length === 1 || allSameSong) {
        return {
          track: unifiedTrack,
          spotifyTrack,
          navidromeSong: variantMatches[0],
          matchedSong: toDestinationMatchCandidate(variantMatches[0]),
          matchStrategy: 'isrc',
          matchScore: 1,
          status: 'matched',
          trackKey: trackTk,
        };
      }
    }
  }

  if (opts.enableFuzzy) {
    const fuzzyResult = findBestMatch(spotifyTrack, candidates, opts.fuzzyThreshold);
    const matchResult: MatchingStrategyResult = {
      strategy: 'fuzzy',
      matched: fuzzyResult.bestMatch !== undefined,
      ambiguous: fuzzyResult.hasAmbiguous,
      navidromeSong: fuzzyResult.bestMatch?.song,
      candidates: fuzzyResult.matches.map((m) => toDestinationMatchCandidate(m.song)),
      score: fuzzyResult.bestMatch?.score ?? 0,
    };
    strategyResults.push(matchResult);

    if (fuzzyResult.bestMatch && !fuzzyResult.hasAmbiguous) {
      return {
        track: unifiedTrack,
        spotifyTrack,
        navidromeSong: fuzzyResult.bestMatch.song,
        matchedSong: toDestinationMatchCandidate(fuzzyResult.bestMatch.song),
        matchStrategy: 'fuzzy',
        matchScore: fuzzyResult.bestMatch.score,
        status: 'matched',
        candidates: fuzzyResult.matches.map((m) => toDestinationMatchCandidate(m.song)),
        trackKey: trackTk,
      };
    }
  }

  if (opts.enableStrict) {
    const strictResult = await matchByStrict(client, spotifyTrack, undefined, signal);
    strategyResults.push({
      strategy: 'strict',
      matched: strictResult.status === 'matched',
      ambiguous: false,
      navidromeSong: strictResult.navidromeSong,
      score: strictResult.matchScore,
    });

    if (strictResult.status === 'matched') {
      return {
        track: unifiedTrack,
        spotifyTrack,
        navidromeSong: strictResult.navidromeSong,
        matchedSong: strictResult.matchedSong,
        matchStrategy: 'strict',
        matchScore: 1,
        status: 'matched',
        trackKey: trackTk,
      };
    }
  }

  const hasAmbiguous = strategyResults.some((r) => r.ambiguous);
  const bestResult = strategyResults.reduce(
    (best, current) => (current.score > best.score ? current : best),
    { score: -1 } as MatchingStrategyResult
  );

  return {
    track: unifiedTrack,
    spotifyTrack,
    navidromeSong: bestResult.navidromeSong,
    matchedSong: bestResult.navidromeSong ? toDestinationMatchCandidate(bestResult.navidromeSong) : undefined,
    matchStrategy: bestResult.strategy,
    matchScore: bestResult.score > 0 ? bestResult.score : 0,
    status: hasAmbiguous ? 'ambiguous' : 'unmatched',
    candidates: bestResult.candidates,
    trackKey: trackTk,
  };
}

export async function matchTracks(
  client: NavidromeApiClient,
  spotifyTracks: SpotifyTrack[],
  options: Partial<MatchingOrchestratorOptions> = {},
  signal?: AbortSignal
): Promise<TrackMatch[]> {
  const results: TrackMatch[] = [];

  for (const track of spotifyTracks) {
    if (signal?.aborted) {
      throw new DOMException('Export was cancelled', 'AbortError');
    }

    try {
      const match = await matchTrack(client, track, options, signal);
      results.push(match);
    } catch (error) {
      console.error("Error matching track:", {
        track,
        error: error instanceof Error ? error.message : String(error),
      });
      results.push({
        track: toUnifiedTrack(track),
        spotifyTrack: track,
        navidromeSong: undefined,
        matchedSong: undefined,
        matchStrategy: "none",
        matchScore: 0,
        status: "unmatched",
        trackKey: getTrackKey(track),
      });
    }
  }

  return results;
}

export function getMatchStatistics(matches: TrackMatch[]): {
  total: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  byStrategy: Record<MatchStrategy, number>;
} {
  const stats = {
    total: matches.length,
    matched: 0,
    ambiguous: 0,
    unmatched: 0,
    byStrategy: {
      isrc: 0,
      fuzzy: 0,
      strict: 0,
      none: 0,
    } as Record<MatchStrategy, number>,
  };

  for (const match of matches) {
    if (match.status === 'matched') {
      stats.matched++;
      stats.byStrategy[match.matchStrategy]++;
    } else if (match.status === 'ambiguous') {
      stats.ambiguous++;
    } else {
      stats.unmatched++;
    }
  }

  return stats;
}

export function getAmbiguousMatches(matches: TrackMatch[]): TrackMatch[] {
  return matches.filter((m) => m.status === 'ambiguous');
}

export function getUnmatchedTracks(matches: TrackMatch[]): SpotifyTrack[] {
  return matches
    .filter((m) => m.status === 'unmatched' || m.status === 'ambiguous')
    .map((m) => m.spotifyTrack || trackToSpotifyTrack(m.track));
}

export function getUnmatchedUnifiedTracks(matches: TrackMatch[]): UnifiedTrack[] {
  return matches
    .filter((m) => m.status === 'unmatched' || m.status === 'ambiguous')
    .map((m) => m.track);
}

export function getMatchedTracks(matches: TrackMatch[]): Array<{
  spotifyTrack: SpotifyTrack;
  navidromeSong: NavidromeSong;
  strategy: MatchStrategy;
}> {
  return matches
    .filter((m) => m.status === 'matched' && (m.navidromeSong || m.matchedSong))
    .map((m) => ({
      spotifyTrack: (m.spotifyTrack || trackToSpotifyTrack(m.track))!,
      navidromeSong: (m.navidromeSong || candidateToNavidromeSong(m.matchedSong))!,
      strategy: m.matchStrategy,
    }));
}

export function getMatchedUnifiedTracks(matches: TrackMatch[]): Array<{
  track: UnifiedTrack;
  matchedSong: DestinationMatchCandidate;
  strategy: MatchStrategy;
}> {
  return matches
    .filter((m) => m.status === 'matched' && (m.matchedSong || m.navidromeSong))
    .map((m) => ({
      track: m.track,
      matchedSong: (m.matchedSong || (m.navidromeSong ? toDestinationMatchCandidate(m.navidromeSong) : undefined))!,
      strategy: m.matchStrategy,
    }));
}