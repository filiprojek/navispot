import { SpotifyTrack } from '@/types/spotify';
import { TrackMatch, MatchStatus } from '@/types/matching';
import { NavidromeApiClient } from '@/lib/navidrome/client';
import { NavidromeNativeSong } from '@/types/navidrome';
import { UnifiedTrack, DestinationMatchCandidate } from '@/types/provider';
import { convertNativeSongToNavidromeSong } from './orchestrator';
import { trackKey as getTrackKey } from '@/lib/spotify/track-identity';
import { normalizeTitle as normalizeTitleFuzzy, normalizeArtistName as normalizeArtistNameFuzzy, hasVersionMismatch } from './fuzzy';
import { toUnifiedTrack } from '@/lib/providers/spotify-adapter';
import { toDestinationMatchCandidate } from '@/lib/providers/navidrome-adapter';

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an)\s+/, '');
}

export function filterStrictMatches<T extends { title: string; artist: string }>(
  songs: T[],
  normalizedArtist: string | null,
  normalizedTitle: string,
  rawSpotifyTitle?: string
): T[] {
  return songs.filter((song) => {
    const songTitle = normalizeTitleFuzzy(song.title);
    if (songTitle !== normalizedTitle) return false;
    if (normalizedArtist !== null) {
      const songArtist = normalizeArtistNameFuzzy(song.artist);
      if (songArtist !== normalizedArtist) return false;
    }
    if (rawSpotifyTitle && hasVersionMismatch(rawSpotifyTitle, song.title)) return false;
    return true;
  });
}

export function matchUnifiedCandidateStrict(
  track: UnifiedTrack,
  candidates: DestinationMatchCandidate[]
): {
  status: MatchStatus;
  matchedCandidate?: DestinationMatchCandidate;
  candidates?: DestinationMatchCandidate[];
} {
  const normTitle = normalizeTitleFuzzy(track.title);
  if (!normTitle) {
    return { status: 'unmatched' };
  }

  const artists = (track.artists || []).map((a) => a.name).filter((n) => n.trim().length > 0);
  const normalizedArtist = artists.length > 0
    ? normalizeArtistNameFuzzy(artists.join(' '))
    : null;

  const matches = filterStrictMatches(candidates, normalizedArtist, normTitle, track.title);

  if (matches.length === 0) {
    return { status: 'unmatched' };
  }

  if (matches.length === 1) {
    return { status: 'matched', matchedCandidate: matches[0] };
  }

  if (matches.length > 1 && normalizedArtist === null) {
    if (track.durationMs) {
      const durationMatches = matches.filter(
        (s) => Math.abs(s.durationMs - track.durationMs) < 2000
      );
      if (durationMatches.length === 1) {
        return { status: 'matched', matchedCandidate: durationMatches[0] };
      }
    }
    return { status: 'ambiguous', candidates: matches };
  }

  const firstMatch = matches[0];
  const allSame = matches.every(
    (m) => m.title === firstMatch.title && m.artist === firstMatch.artist
  );

  if (!allSame) {
    return { status: 'ambiguous', candidates: matches };
  }

  return { status: 'matched', matchedCandidate: firstMatch };
}

export async function matchByStrict(
  client: NavidromeApiClient,
  spotifyTrack: SpotifyTrack,
  candidates?: NavidromeNativeSong[],
  signal?: AbortSignal
): Promise<TrackMatch> {
  const tk = getTrackKey(spotifyTrack);
  const unifiedTrack = toUnifiedTrack(spotifyTrack);
  const hasArtist = spotifyTrack.artists && spotifyTrack.artists.length > 0 && spotifyTrack.artists.some(a => a.name.trim().length > 0);
  const normalizedArtist = hasArtist
    ? normalizeArtistNameFuzzy(spotifyTrack.artists.map((a) => a.name).join(' '))
    : null;
  const normalizedTitle = normalizeTitleFuzzy(spotifyTrack.name);

  if (!normalizedTitle) {
    return {
      track: unifiedTrack,
      spotifyTrack,
      matchStrategy: 'strict',
      matchScore: 0,
      status: 'unmatched',
      trackKey: tk,
    };
  }

  try {
    const songs = candidates || await client.searchByTitle(spotifyTrack.name, 100, signal);
    const matches = filterStrictMatches(songs, normalizedArtist, normalizedTitle, spotifyTrack.name);

    if (matches.length === 0) {
      return {
        track: unifiedTrack,
        spotifyTrack,
        matchStrategy: 'strict',
        matchScore: 0,
        status: 'unmatched',
        trackKey: tk,
      };
    }

    if (matches.length > 1 && normalizedArtist === null) {
      const spotifyDurationSec = spotifyTrack.duration_ms / 1000;
      const durationMatches = matches.filter(
        (s) => Math.abs(s.duration - spotifyDurationSec) < 2
      );
      if (durationMatches.length === 1) {
        const ndSong = convertNativeSongToNavidromeSong(durationMatches[0]);
        return {
          track: unifiedTrack,
          spotifyTrack,
          navidromeSong: ndSong,
          matchedSong: toDestinationMatchCandidate(ndSong),
          matchStrategy: 'strict',
          matchScore: 1,
          status: 'matched',
          trackKey: tk,
        };
      }
      return {
        track: unifiedTrack,
        spotifyTrack,
        matchStrategy: 'strict',
        matchScore: 0,
        status: 'ambiguous',
        candidates: matches.map(convertNativeSongToNavidromeSong).map(toDestinationMatchCandidate),
        trackKey: tk,
      };
    }

    const firstMatch = matches[0];
    const allSame = matches.every(
      (m) => m.title === firstMatch.title && m.artist === firstMatch.artist
    );

    if (!allSame) {
      return {
        track: unifiedTrack,
        spotifyTrack,
        matchStrategy: 'strict',
        matchScore: 0,
        status: 'ambiguous',
        candidates: matches.map(convertNativeSongToNavidromeSong).map(toDestinationMatchCandidate),
        trackKey: tk,
      };
    }

    const ndSong = convertNativeSongToNavidromeSong(firstMatch);
    return {
      track: unifiedTrack,
      spotifyTrack,
      navidromeSong: ndSong,
      matchedSong: toDestinationMatchCandidate(ndSong),
      matchStrategy: 'strict',
      matchScore: 1,
      status: 'matched',
      trackKey: tk,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return {
      track: unifiedTrack,
      spotifyTrack,
      matchStrategy: 'strict',
      matchScore: 0,
      status: 'unmatched',
      trackKey: tk,
    };
  }
}

