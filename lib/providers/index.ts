export {
  SpotifyAdapter,
  createSpotifyAdapter,
  toUnifiedTrack as spotifyToUnifiedTrack,
  toUnifiedPlaylist as spotifyToUnifiedPlaylist,
  toDestinationMatchCandidate as spotifyToDestinationCandidate,
  canParseSpotifyUrl,
} from './spotify-adapter';

export {
  NavidromeAdapter,
  createNavidromeAdapter,
  toUnifiedTrack as navidromeToUnifiedTrack,
  toUnifiedPlaylist as navidromeToUnifiedPlaylist,
  toDestinationMatchCandidate as navidromeToDestinationCandidate,
  canParseNavidromeUrl,
} from './navidrome-adapter';

export {
  AppleMusicAdapter,
  createAppleMusicAdapter,
  toUnifiedTrack as appleMusicToUnifiedTrack,
  toUnifiedPlaylist as appleMusicToUnifiedPlaylist,
  toDestinationMatchCandidate as appleMusicToDestinationCandidate,
} from './apple-music-adapter';
