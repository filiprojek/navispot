import { SpotifyTrack } from './spotify';
import { NavidromeSong } from './navidrome';
import { UnifiedTrack, DestinationMatchCandidate } from './provider';

export type MatchStrategy = 'isrc' | 'fuzzy' | 'strict' | 'none';
export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched';

export interface TrackMatch {
  track: UnifiedTrack;
  // Backwards-compatible aliases:
  spotifyTrack?: SpotifyTrack;
  matchedSong?: DestinationMatchCandidate;
  navidromeSong?: NavidromeSong;
  matchScore: number;
  matchStrategy: MatchStrategy;
  status: MatchStatus;
  candidates?: DestinationMatchCandidate[];
  trackKey: string;
  entryKey?: string;
}

