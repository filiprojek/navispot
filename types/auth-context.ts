import { SpotifyToken, SpotifyUser } from './spotify-auth';
import { NavidromeCredentials, NavidromePlaylist } from './navidrome';
import { SpotifyPlaylist } from './spotify';
import { ProviderId, UnifiedPlaylist } from './provider';

export interface SpotifyAuthState {
  isAuthenticated: boolean;
  user: SpotifyUser | null;
  token: SpotifyToken | null;
}

export interface NavidromeAuthState {
  isConnected: boolean;
  credentials: NavidromeCredentials | null;
  serverVersion: string | null;
  error: string | null;
  token: string | null;
  clientId: string | null;
}

export interface AppleMusicAuthState {
  isAuthenticated: boolean;
  mode: 'musickit' | 'web-token' | null;
  developerToken: string | null;
  musicUserToken: string | null;
  storefront: string;
  error: string | null;
}

export interface AuthContextType {
  spotify: SpotifyAuthState;
  navidrome: NavidromeAuthState;
  appleMusic: AppleMusicAuthState;
  activeSource: ProviderId;
  activeDestination: ProviderId;
  setActiveSource: (source: ProviderId) => void;
  setActiveDestination: (dest: ProviderId) => void;
  connectAppleMusicWithTokens: (tokens: {
    developerToken?: string;
    musicUserToken?: string;
    storefront?: string;
  }) => Promise<boolean>;
  disconnectAppleMusic: () => void;
  appleMusicPlaylists: UnifiedPlaylist[];
  appleMusicFavoritesCount: number;
  refreshAppleMusicPlaylists: () => Promise<void>;
  spotifyLogin: () => Promise<void>;
  spotifyLogout: () => Promise<void>;
  refreshSpotifyToken: () => Promise<boolean>;
  setNavidromeCredentials: (credentials: NavidromeCredentials) => Promise<boolean>;
  testNavidromeConnection: (credentials: NavidromeCredentials) => Promise<boolean>;
  clearNavidromeCredentials: () => void;
  isLoading: boolean;
  skipSpotify: boolean;
  setSkipSpotify: (skip: boolean) => void;
  playlists: SpotifyPlaylist[];
  navidromePlaylists: NavidromePlaylist[];
  likedSongsCount: number;
  fetchError: string | null;
  refreshing: boolean;
  refreshData: () => Promise<void>;
}

export const SPOTIFY_STORAGE_KEY = 'navispot_spotify_auth';
export const NAVIDROME_STORAGE_KEY = 'navispot_navidrome_auth';
export const APPLE_MUSIC_STORAGE_KEY = 'navispot_apple_music_auth';
export const SKIP_SPOTIFY_STORAGE_KEY = 'navispot_skip_spotify';
export const ACTIVE_SOURCE_STORAGE_KEY = 'navispot_active_source';
export const ACTIVE_DESTINATION_STORAGE_KEY = 'navispot_active_destination';
