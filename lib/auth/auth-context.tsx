'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  AuthContextType,
  SpotifyAuthState,
  NavidromeAuthState,
  AppleMusicAuthState,
  SPOTIFY_STORAGE_KEY,
  NAVIDROME_STORAGE_KEY,
  APPLE_MUSIC_STORAGE_KEY,
  SKIP_SPOTIFY_STORAGE_KEY,
  ACTIVE_SOURCE_STORAGE_KEY,
  ACTIVE_DESTINATION_STORAGE_KEY,
} from '@/types/auth-context';
import { SpotifyToken, SpotifyUser } from '@/types/spotify-auth';
import { SpotifyPlaylist } from '@/types/spotify';
import { NavidromePlaylist, NavidromeCredentials } from '@/types/navidrome';
import { ProviderId, UnifiedPlaylist } from '@/types/provider';
import { NavidromeApiClient } from '@/lib/navidrome/client';
import { spotifyClient } from '@/lib/spotify/client';
import { AppleMusicClient } from '@/lib/apple-music/client';
import { AppleMusicAdapter } from '@/lib/providers/apple-music-adapter';
import { setStoredTokens, clearStoredTokens } from '@/lib/apple-music/token-manager';
import { getJSON, setJSON } from '@/lib/storage';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [spotify, setSpotify] = useState<SpotifyAuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
  });
  const [navidrome, setNavidrome] = useState<NavidromeAuthState>({
    isConnected: false,
    credentials: null,
    serverVersion: null,
    error: null,
    token: null,
    clientId: null,
  });
  const [appleMusic, setAppleMusic] = useState<AppleMusicAuthState>({
    isAuthenticated: false,
    mode: null,
    developerToken: null,
    musicUserToken: null,
    storefront: 'us',
    error: null,
  });
  const [appleMusicPlaylists, setAppleMusicPlaylists] = useState<UnifiedPlaylist[]>([]);
  const [appleMusicFavoritesCount, setAppleMusicFavoritesCount] = useState<number>(0);

  const [activeSource, setActiveSourceState] = useState<ProviderId>(() =>
    getJSON<ProviderId>(ACTIVE_SOURCE_STORAGE_KEY, 'spotify'),
  );
  const [activeDestination, setActiveDestinationState] = useState<ProviderId>(() =>
    getJSON<ProviderId>(ACTIVE_DESTINATION_STORAGE_KEY, 'navidrome'),
  );

  const [isLoading, setIsLoading] = useState(true);
  const [skipSpotify, setSkipSpotifyState] = useState<boolean>(() =>
    getJSON<boolean>(SKIP_SPOTIFY_STORAGE_KEY, false),
  );

  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [navidromePlaylists, setNavidromePlaylists] = useState<NavidromePlaylist[]>([]);
  const [likedSongsCount, setLikedSongsCount] = useState<number>(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const testNavidromeConnection = useCallback(async (credentials: NavidromeCredentials): Promise<boolean> => {
    if (!credentials) {
      setNavidrome((prev) => ({
        ...prev,
        isConnected: false,
        serverVersion: null,
        error: 'No credentials set',
        token: null,
        clientId: null,
      }));
      return false;
    }

    try {
      const storedAuth = localStorage.getItem(NAVIDROME_STORAGE_KEY);
      let storedToken = '';
      let storedClientId = '';

      if (storedAuth) {
        const parsed = JSON.parse(storedAuth);
        storedToken = parsed.token ?? '';
        storedClientId = parsed.clientId ?? '';
      }

      const client = new NavidromeApiClient(
        credentials.url,
        credentials.username,
        credentials.password,
        storedToken || undefined,
        storedClientId || undefined
      );

      await client.ping();
      const token = client.getToken();
      const clientId = client.getClientId();

      if (token && clientId) {
        localStorage.setItem(NAVIDROME_STORAGE_KEY, JSON.stringify({
          url: credentials.url,
          username: credentials.username,
          password: credentials.password,
          token,
          clientId,
        }));

        setNavidrome((prev) => ({
          ...prev,
          isConnected: true,
          serverVersion: 'Navidrome (native API)',
          error: null,
          token,
          clientId,
        }));
        return true;
      }

      setNavidrome((prev) => ({
        ...prev,
        isConnected: false,
        serverVersion: null,
        error: 'Failed to authenticate',
        token: null,
        clientId: null,
      }));
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      setNavidrome((prev) => ({
        ...prev,
        isConnected: false,
        serverVersion: null,
        error: errorMessage,
        token: null,
        clientId: null,
      }));
      return false;
    }
  }, []);

  const refreshSpotifyTokenFromStorage = useCallback(async (token: SpotifyToken, user: SpotifyUser): Promise<boolean> => {
    if (!token.refreshToken) return false;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token.refreshToken }),
      });

      if (!response.ok) return false;

      const newToken = await response.json();
      const updatedToken: SpotifyToken = {
        ...token,
        accessToken: newToken.access_token,
        expiresAt: Date.now() + newToken.expires_in * 1000,
      };

      localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify({ token: updatedToken, user }));
      setSpotify({
        isAuthenticated: true,
        token: updatedToken,
        user,
      });
      return true;
    } catch (error) {
      console.error('Error refreshing Spotify token on load:', error);
      return false;
    }
  }, []);

  const fetchInitialData = useCallback(async (spotifyState: SpotifyAuthState, navidromeState: NavidromeAuthState) => {
    const hasSpotify = spotifyState.isAuthenticated && !!spotifyState.token;

    if (!hasSpotify) {
      setPlaylists([]);
      setLikedSongsCount(0);
      setFetchError(null);
      return;
    }

    setFetchError(null);

    try {
      spotifyClient.setToken(spotifyState.token!);
      const fetchedPlaylists = await spotifyClient.getAllPlaylists();
      setPlaylists(fetchedPlaylists);

      try {
        const count = await spotifyClient.getSavedTracksCount();
        setLikedSongsCount(count);
      } catch {
        setLikedSongsCount(0);
      }

      if (
        navidromeState.isConnected &&
        navidromeState.credentials &&
        navidromeState.token &&
        navidromeState.clientId
      ) {
        const navidromeClient = new NavidromeApiClient(
          navidromeState.credentials.url,
          navidromeState.credentials.username,
          navidromeState.credentials.password,
          navidromeState.token,
          navidromeState.clientId,
        );
        try {
          const navPlaylists = await navidromeClient.getPlaylists();
          setNavidromePlaylists(navPlaylists);
        } catch (navErr) {
          console.warn('Failed to fetch Navidrome playlists:', navErr);
        }
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch playlists');
    }
  }, []);

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      if (spotify.isAuthenticated && spotify.token) {
        await fetchInitialData(spotify, navidrome);
      }
      if (appleMusic.isAuthenticated && appleMusic.developerToken && appleMusic.musicUserToken) {
        try {
          const client = new AppleMusicClient({
            developerToken: appleMusic.developerToken,
            musicUserToken: appleMusic.musicUserToken,
            storefront: appleMusic.storefront || 'us',
          });
          const adapter = new AppleMusicAdapter(client);
          const [pLists, favs] = await Promise.allSettled([
            adapter.listPlaylists(),
            adapter.getFavorites(),
          ]);
          if (pLists.status === 'fulfilled') {
            setAppleMusicPlaylists(pLists.value);
          }
          if (favs.status === 'fulfilled') {
            setAppleMusicFavoritesCount(favs.value.length);
          }
        } catch (err) {
          console.warn('Failed to refresh Apple Music in refreshData:', err);
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [spotify, navidrome, appleMusic, fetchInitialData]);

  const loadStoredAuth = useCallback(async () => {
    let resolvedSpotify: SpotifyAuthState = {
      isAuthenticated: false,
      user: null,
      token: null,
    };
    let resolvedNavidrome: NavidromeAuthState = {
      isConnected: false,
      credentials: null,
      serverVersion: null,
      error: null,
      token: null,
      clientId: null,
    };

    try {
      const storedSpotify = localStorage.getItem(SPOTIFY_STORAGE_KEY);
      if (storedSpotify) {
        const parsed = JSON.parse(storedSpotify) as { token: SpotifyToken; user: SpotifyUser };
        if (parsed.token) {
          const isExpired = parsed.token.expiresAt <= Date.now();

          if (isExpired) {
            const refreshed = await refreshSpotifyTokenFromStorage(parsed.token, parsed.user);
            if (refreshed) {
              resolvedSpotify = {
                isAuthenticated: true,
                token: JSON.parse(localStorage.getItem(SPOTIFY_STORAGE_KEY)!).token,
                user: parsed.user,
              };
            } else {
              localStorage.removeItem(SPOTIFY_STORAGE_KEY);
            }
          } else {
            setSpotify({
              isAuthenticated: true,
              token: parsed.token,
              user: parsed.user,
            });
            resolvedSpotify = {
              isAuthenticated: true,
              token: parsed.token,
              user: parsed.user,
            };
          }
        } else {
          localStorage.removeItem(SPOTIFY_STORAGE_KEY);
        }
      }

      const storedNavidrome = localStorage.getItem(NAVIDROME_STORAGE_KEY);
      if (storedNavidrome) {
        const parsed = JSON.parse(storedNavidrome);
        const navCreds = { url: parsed.url, username: parsed.username, password: parsed.password };
        setNavidrome((prev) => ({
          ...prev,
          credentials: navCreds,
          token: parsed.token ?? null,
          clientId: parsed.clientId ?? '',
        }));
        resolvedNavidrome = {
          isConnected: false,
          credentials: navCreds,
          serverVersion: null,
          error: null,
          token: parsed.token ?? null,
          clientId: parsed.clientId ?? '',
        };
        await testNavidromeConnection(navCreds);
      }

      const storedAppleMusic = localStorage.getItem(APPLE_MUSIC_STORAGE_KEY);
      if (storedAppleMusic) {
        try {
          const parsed = JSON.parse(storedAppleMusic);
          if (parsed.developerToken && parsed.musicUserToken) {
            const amState: AppleMusicAuthState = {
              isAuthenticated: true,
              mode: parsed.mode || 'web-token',
              developerToken: parsed.developerToken,
              musicUserToken: parsed.musicUserToken,
              storefront: parsed.storefront || 'us',
              error: null,
            };
            setAppleMusic(amState);
            const client = new AppleMusicClient({
              developerToken: parsed.developerToken,
              musicUserToken: parsed.musicUserToken,
              storefront: parsed.storefront || 'us',
            });
            const adapter = new AppleMusicAdapter(client);
            adapter.listPlaylists().then(setAppleMusicPlaylists).catch((err) => {
              console.warn('Failed to load initial Apple Music playlists:', err);
            });
            adapter.getFavorites().then((favs) => {
              setAppleMusicFavoritesCount(favs.length);
            }).catch(() => {});
          }
        } catch (amErr) {
          console.error('Error parsing stored Apple Music auth:', amErr);
        }
      }

      if (!storedSpotify) {
        const response = await fetch('/api/auth/session');
        const data = await response.json();

        if (data.authenticated && data.token) {
          const response2 = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${data.token.accessToken}` },
          });

          if (response2.ok) {
            const user = await response2.json();
            const authData = { token: data.token, user };
            localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(authData));
            setSpotify({
              isAuthenticated: true,
              token: data.token,
              user,
            });
            resolvedSpotify = {
              isAuthenticated: true,
              token: data.token,
              user,
            };
          }
        }
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    }

    await fetchInitialData(resolvedSpotify, resolvedNavidrome);

    setIsLoading(false);
  }, [testNavidromeConnection, refreshSpotifyTokenFromStorage, fetchInitialData]);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const spotifyLogin = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/spotify');
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error initiating Spotify login:', error);
      throw error;
    }
  }, []);

  const spotifyLogout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/spotify', { method: 'DELETE' });
      if (response.ok) {
        localStorage.removeItem(SPOTIFY_STORAGE_KEY);
        setSpotify({
          isAuthenticated: false,
          user: null,
          token: null,
        });
        setPlaylists([]);
        setLikedSongsCount(0);
        setNavidromePlaylists([]);
        setFetchError(null);
      }
    } catch (error) {
      console.error('Error logging out from Spotify:', error);
      localStorage.removeItem(SPOTIFY_STORAGE_KEY);
      setSpotify({
        isAuthenticated: false,
        user: null,
        token: null,
      });
      setPlaylists([]);
      setLikedSongsCount(0);
      setNavidromePlaylists([]);
      setFetchError(null);
    }
  }, []);

  const refreshSpotifyToken = useCallback(async (): Promise<boolean> => {
    try {
      const stored = localStorage.getItem(SPOTIFY_STORAGE_KEY);
      if (!stored) return false;

      const parsed = JSON.parse(stored) as { token: SpotifyToken };
      if (!parsed.token?.refreshToken) return false;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: parsed.token.refreshToken }),
      });

      if (!response.ok) return false;

      const newToken = await response.json();
      const updatedToken: SpotifyToken = {
        ...parsed.token,
        accessToken: newToken.access_token,
        expiresAt: Date.now() + newToken.expires_in * 1000,
      };

      localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify({ token: updatedToken, user: spotify.user }));
      setSpotify((prev) => ({ ...prev, token: updatedToken }));
      return true;
    } catch (error) {
      console.error('Error refreshing Spotify token:', error);
      return false;
    }
  }, [spotify.user]);

  const setNavidromeCredentials = useCallback(async (credentials: NavidromeCredentials): Promise<boolean> => {
    setNavidrome((prev) => ({ ...prev, error: null, credentials }));

    try {
      const client = new NavidromeApiClient(
        credentials.url,
        credentials.username,
        credentials.password
      );

      const loginResult = await client.login(credentials.username, credentials.password);

      if (!loginResult.success) {
        setNavidrome((prev) => ({
          ...prev,
          isConnected: false,
          error: loginResult.error || 'Login failed',
          token: null,
          clientId: null,
        }));
        return false;
      }

      const token = client.getToken();
      const clientId = client.getClientId();

      localStorage.setItem(NAVIDROME_STORAGE_KEY, JSON.stringify({
        url: credentials.url,
        username: credentials.username,
        password: credentials.password,
        token,
        clientId,
      }));

      const nextNavidrome: NavidromeAuthState = {
        isConnected: true,
        serverVersion: 'Navidrome (native API)',
        error: null,
        token,
        clientId,
        credentials,
      };
      setNavidrome(nextNavidrome);

      if (spotify.isAuthenticated && spotify.token) {
        try {
          const navidromeClient = new NavidromeApiClient(
            credentials.url,
            credentials.username,
            credentials.password,
            token,
            clientId,
          );
          const navPlaylists = await navidromeClient.getPlaylists();
          setNavidromePlaylists(navPlaylists);
        } catch (navErr) {
          console.warn('Failed to fetch Navidrome playlists:', navErr);
        }
      }

      return true;
    } catch (error) {
      console.error('Error setting Navidrome credentials:', error);
      setNavidrome((prev) => ({
        ...prev,
        isConnected: false,
        error: 'Failed to save credentials',
        token: null,
        clientId: null,
      }));
      return false;
    }
  }, [spotify.isAuthenticated, spotify.token]);

  const clearNavidromeCredentials = useCallback(() => {
    localStorage.removeItem(NAVIDROME_STORAGE_KEY);
    setNavidrome({
      isConnected: false,
      credentials: null,
      serverVersion: null,
      error: null,
      token: null,
      clientId: null,
    });
    setNavidromePlaylists([]);
  }, []);

  const setSkipSpotify = useCallback((skip: boolean) => {
    setSkipSpotifyState(skip);
    if (skip) {
      setJSON(SKIP_SPOTIFY_STORAGE_KEY, true);
    } else {
      try { window.localStorage.removeItem(SKIP_SPOTIFY_STORAGE_KEY); } catch { /* ignore */ }
    }
  }, []);

  const setActiveSource = useCallback((source: ProviderId) => {
    setActiveSourceState(source);
    setJSON(ACTIVE_SOURCE_STORAGE_KEY, source);
    setActiveDestinationState((prevDest) => {
      if (prevDest === source) {
        const candidates: ProviderId[] = ['navidrome', 'apple-music', 'spotify'];
        const nextDest = candidates.find((c) => c !== source) || 'navidrome';
        setJSON(ACTIVE_DESTINATION_STORAGE_KEY, nextDest);
        return nextDest;
      }
      return prevDest;
    });
  }, []);

  const setActiveDestination = useCallback(
    (dest: ProviderId) => {
      if (dest === activeSource) return;
      setActiveDestinationState(dest);
      setJSON(ACTIVE_DESTINATION_STORAGE_KEY, dest);
    },
    [activeSource]
  );

  const connectAppleMusicWithTokens = useCallback(
    async (tokens: {
      developerToken?: string;
      musicUserToken?: string;
      storefront?: string;
    }): Promise<boolean> => {
      let devToken = tokens.developerToken?.trim() || '';
      const userToken = tokens.musicUserToken?.trim() || '';
      const storefront = tokens.storefront?.trim() || 'us';

      if (!devToken) {
        try {
          const res = await fetch('/api/apple-music/developer-token');
          if (res.ok) {
            const data = await res.json();
            if (data.developerToken) {
              devToken = data.developerToken;
            }
          }
        } catch {
          // ignore
        }
      }

      if (!devToken) {
        setAppleMusic((prev) => ({
          ...prev,
          isAuthenticated: false,
          error: 'Apple Music Developer Token is required',
        }));
        return false;
      }

      if (!userToken) {
        setAppleMusic((prev) => ({
          ...prev,
          isAuthenticated: false,
          error: 'Media-User-Token is required',
        }));
        return false;
      }

      try {
        const client = new AppleMusicClient({
          developerToken: devToken,
          musicUserToken: userToken,
          storefront,
        });

        const adapter = new AppleMusicAdapter(client);
        const pLists = await adapter.listPlaylists();

        const nextState: AppleMusicAuthState = {
          isAuthenticated: true,
          mode: 'web-token',
          developerToken: devToken,
          musicUserToken: userToken,
          storefront,
          error: null,
        };

        localStorage.setItem(APPLE_MUSIC_STORAGE_KEY, JSON.stringify(nextState));
        setStoredTokens({ developerToken: devToken, musicUserToken: userToken, storefront });

        setAppleMusic(nextState);
        setAppleMusicPlaylists(pLists);

        try {
          const favs = await adapter.getFavorites();
          setAppleMusicFavoritesCount(favs.length);
        } catch {
          setAppleMusicFavoritesCount(0);
        }

        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to connect to Apple Music';
        setAppleMusic((prev) => ({
          ...prev,
          isAuthenticated: false,
          error: msg,
        }));
        return false;
      }
    },
    []
  );

  const disconnectAppleMusic = useCallback(() => {
    localStorage.removeItem(APPLE_MUSIC_STORAGE_KEY);
    clearStoredTokens();
    setAppleMusic({
      isAuthenticated: false,
      mode: null,
      developerToken: null,
      musicUserToken: null,
      storefront: 'us',
      error: null,
    });
    setAppleMusicPlaylists([]);
    setAppleMusicFavoritesCount(0);
  }, []);

  const refreshAppleMusicPlaylists = useCallback(async () => {
    if (!appleMusic.isAuthenticated || !appleMusic.developerToken || !appleMusic.musicUserToken) {
      return;
    }
    try {
      const client = new AppleMusicClient({
        developerToken: appleMusic.developerToken,
        musicUserToken: appleMusic.musicUserToken,
        storefront: appleMusic.storefront || 'us',
      });
      const adapter = new AppleMusicAdapter(client);
      const [pLists, favs] = await Promise.allSettled([
        adapter.listPlaylists(),
        adapter.getFavorites(),
      ]);
      if (pLists.status === 'fulfilled') {
        setAppleMusicPlaylists(pLists.value);
      }
      if (favs.status === 'fulfilled') {
        setAppleMusicFavoritesCount(favs.value.length);
      }
    } catch (err) {
      console.warn('Failed to refresh Apple Music playlists:', err);
    }
  }, [appleMusic]);

  const value: AuthContextType = {
    spotify,
    navidrome,
    appleMusic,
    activeSource,
    activeDestination,
    setActiveSource,
    setActiveDestination,
    connectAppleMusicWithTokens,
    disconnectAppleMusic,
    appleMusicPlaylists,
    appleMusicFavoritesCount,
    refreshAppleMusicPlaylists,
    spotifyLogin,
    spotifyLogout,
    refreshSpotifyToken,
    setNavidromeCredentials,
    testNavidromeConnection,
    clearNavidromeCredentials,
    isLoading,
    skipSpotify,
    setSkipSpotify,
    playlists,
    navidromePlaylists,
    likedSongsCount,
    fetchError,
    refreshing,
    refreshData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
