import { SpotifyTrack } from '@/types/spotify';
import { TrackMatch } from '@/types/matching';
import { NavidromeApiClient } from '@/lib/navidrome/client';
import { trackKey as getTrackKey } from '@/lib/spotify/track-identity';
import { toUnifiedTrack } from '@/lib/providers/spotify-adapter';

export async function matchByISRC(
  _client: NavidromeApiClient,
  spotifyTrack: SpotifyTrack
): Promise<TrackMatch> {
  const isrc = spotifyTrack.external_ids?.isrc;
  const tk = getTrackKey(spotifyTrack);
  const track = toUnifiedTrack(spotifyTrack);

  if (!isrc) {
    return {
      track,
      spotifyTrack,
      matchStrategy: 'isrc',
      matchScore: 0,
      status: 'unmatched',
      trackKey: tk,
    };
  }

  return {
    track,
    spotifyTrack,
    matchStrategy: 'isrc',
    matchScore: 0,
    status: 'unmatched',
    trackKey: tk,
  };
}

