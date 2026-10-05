# Feature: Apple Music Integration & Soundiiz Multi-Provider Platform

## Overview
Expands NaviSpot from a point-to-point Spotify-to-Navidrome exporter into a modular, multi-source, multi-destination music sync and migration platform supporting Apple Music, Spotify, and Navidrome.

## Implementation Tasks (To-Do List)

- [x] **Task 1: Core Provider & Canonical Data Abstraction**
  - [x] Create `types/provider.ts` with `UnifiedTrack`, `UnifiedPlaylist`, `SourceProvider`, and `DestinationProvider` interfaces.
  - [x] Implement `lib/providers/spotify-adapter.ts` (`SourceProvider` & `DestinationProvider` for Spotify).
  - [x] Implement `lib/providers/navidrome-adapter.ts` (`DestinationProvider` & `SourceProvider` for Navidrome).
  - [x] Add unit tests for type conversions and adapters (`lib/providers/adapters.test.ts`).

- [x] **Task 2: Apple Music Client & URL Parser**
  - [x] Create `lib/apple-music/types.ts` for catalog and library response models.
  - [x] Create `lib/apple-music/url-parser.ts` to parse Apple Music playlist and track URLs.
  - [x] Implement `lib/apple-music/token-manager.ts` for developer and user session tokens.
  - [x] Implement `lib/apple-music/client.ts` for catalog, library playlists, favorites, and search.
  - [x] Implement `lib/providers/apple-music-adapter.ts` implementing `SourceProvider` and `DestinationProvider`.
  - [x] Add API routes:
    - `app/api/apple-music/public-playlist/route.ts`
    - `app/api/apple-music/developer-token/route.ts`
  - [x] Add unit tests (`lib/apple-music/url-parser.test.ts`, `lib/apple-music/client.test.ts`, `lib/apple-music/token-manager.test.ts`, `lib/providers/apple-music-adapter.test.ts`, `app/api/apple-music/apple-music-api.test.ts`).

- [x] **Task 3: Decoupled Matching Engine & Exporter**
  - [x] Refactor `lib/matching/orchestrator.ts` to accept `UnifiedTrack` and `DestinationProvider`.
  - [x] Refactor `lib/matching/batch-matcher.ts` to operate on `UnifiedTrack[]` and `DestinationProvider`.
  - [x] Refactor `lib/export/playlist-exporter.ts` to accept `DestinationProvider`.
  - [x] Verify backward compatibility with existing tests and add multi-provider matching tests.

- [x] **Task 4: Multi-Provider Authentication & Soundiiz UI Overhaul**
  - [x] Extend `types/auth-context.ts` and `lib/auth/auth-context.tsx` with multi-provider state (`appleMusic`, `spotify`, `navidrome`).
  - [x] Create Apple Music connection components (`components/apple-music-connect-button.tsx`, `components/apple-music-credentials-modal.tsx`).
  - [x] Update `components/Dashboard/Dashboard.tsx` with:
    - Source Selector tabs (Spotify, Apple Music, Navidrome).
    - Destination Selector (Navidrome, Apple Music, Spotify).
    - Smart search/URL input for both Spotify and Apple Music URLs.
    - Source badges on playlists.
  - [x] Enforce Material Design 3 guidelines (clean tokens, no emojis in UI).
  - [x] Add unit tests in `components/apple-music-ui.test.tsx`.

- [x] **Task 5: End-to-End Verification & Merge**
  - [x] Run test suite (`pnpm test`) - 211 tests passing across 12 files.
  - [x] Run linter (`pnpm lint`) - 0 errors.
  - [x] Verify build (`pnpm build`) - compiled successfully with Turbopack.
  - [x] Merge to main and push.

---

## Task 1 Completed Architecture & Documentation

### 1. Canonical Provider & Data Models (`types/provider.ts`)
- **`ProviderId`**: `'spotify' | 'apple-music' | 'navidrome'`
- **`UnifiedTrack`**: Canonical track format representing any audio track across Spotify, Apple Music, and Navidrome. Standardizes duration in milliseconds (`durationMs`), artist array (`artists: { id?: string; name: string }[]`), album details (`album: { id?: string; name: string; releaseDate?: string }`), and international standard recording codes (`isrc`).
- **`UnifiedPlaylist`**: Canonical playlist format with owner representation, track counts, public visibility, snapshot ID, and flags for imported public playlists and liked songs collections.
- **`DestinationMatchCandidate`**: Standardized format returned when searching destination providers for match candidates by ISRC or query string.
- **`SourceProvider`**: Uniform interface for source platforms to list playlists, retrieve tracks, fetch user favorites/saved tracks, check URL compatibility, and import public playlists.
- **`DestinationProvider`**: Uniform interface for destination platforms to check connection, search by ISRC or title/artist, create playlists, append tracks, and save favorites.

### 2. Spotify Adapter (`lib/providers/spotify-adapter.ts`)
- Implements both `SourceProvider` and `DestinationProvider` using `SpotifyClient`.
- Implements bidirectional conversion functions:
  - `toUnifiedTrack(spotifyTrack: SpotifyTrack): UnifiedTrack`
  - `spotifyTrackFromUnified(unifiedTrack: UnifiedTrack): SpotifyTrack`
  - `toUnifiedPlaylist(playlist: SpotifyPlaylist | ImportedPlaylist): UnifiedPlaylist`
  - `toDestinationMatchCandidate(track: SpotifyTrack): DestinationMatchCandidate`
- Features robust URL parsing (`canParseSpotifyUrl`) handling Open Spotify URLs, Spotify URIs, and raw IDs, while excluding Apple Music URLs.
- Implements public playlist retrieval via injected fetcher, browser Next.js API route (`/api/spotify/public-playlist`), or dynamic server-side import of `lib/spotify/public-client`.
- Implements destination searching (`searchByIsrc`, `searchByQuery` with fallback), playlist creation, batch track addition (`addTracksToPlaylist` in batches of 100), and favorite saving (`saveTracks` in batches of 50).

### 3. Navidrome Adapter (`lib/providers/navidrome-adapter.ts`)
- Implements both `DestinationProvider` and `SourceProvider` using `NavidromeApiClient`.
- Automatically handles duration unit differences (converting Navidrome seconds to canonical milliseconds `durationMs` and vice-versa).
- Implements conversion functions:
  - `toUnifiedTrack(song: NavidromeNativeSong | NavidromeSong): UnifiedTrack`
  - `navidromeSongFromUnified(unifiedTrack: UnifiedTrack): NavidromeSong`
  - `toUnifiedPlaylist(playlist: NavidromePlaylist): UnifiedPlaylist`
  - `toDestinationMatchCandidate(song: NavidromeNativeSong | NavidromeSong): DestinationMatchCandidate`
- Implements `SourceProvider` methods:
  - `listPlaylists`: retrieves all user playlists.
  - `getPlaylistTracks`: fetches tracks via Subsonic `getPlaylist` (`/rest/getPlaylist`) with fallback to native `/api/playlist/:id/tracks`.
  - `getFavorites`: fetches starred tracks via Subsonic `getStarred2` (`/rest/getStarred2`) with fallback to native `/api/song?starred=true`.
  - `canParseUrl` & `getPublicPlaylist`: parses Navidrome playlist URLs.
- Implements `DestinationProvider` methods:
  - `searchByIsrc`: queries songs and filters exact matches by ISRC metadata tags.
  - `searchByQuery`: searches with title & artist, falling back to title-only.
  - `createPlaylist`, `appendToPlaylist`, and `saveFavorites` (using Navidrome batch starring).

### 4. Unit Test Suite (`lib/providers/adapters.test.ts`)
- 43 comprehensive unit tests validating:
  - Bidirectional track conversions for Spotify and Navidrome.
  - Playlist conversions including liked/starred collections and imported playlists.
  - Destination match candidate mappings.
  - URL detection and filtering.
  - Mocked calls and error handling for all `SourceProvider` and `DestinationProvider` methods on both adapters.

---

## Task 2 Completed Architecture & Documentation

### 1. Apple Music Types & Models (`lib/apple-music/types.ts`)
- Defines full TypeScript interfaces for Apple Music Catalog & Library APIs:
  - `AppleMusicSongAttributes`: `name`, `artistName`, `albumName`, `durationInMillis`, `isrc`, `url`, `releaseDate`, `trackNumber`, and `artwork`.
  - `AppleMusicPlaylistAttributes`: `name`, `description`, `curatorName`, `isChart`, `trackTypes`, `url`, `artwork`, and `playParams`.
  - `AppleMusicResource<T>`: Standard JSON:API resource container with `id`, `type`, `href`, `attributes`, and typed `relationships`.
  - `AppleMusicResponse<T>` and `AppleMusicSearchResponse`: Paginated catalog and library responses.
  - `AppleMusicErrorResponse` and `AppleMusicError`: Normalized error structure.
  - `AppleMusicAuthTokens`: `developerToken`, `musicUserToken`, and `storefront`.
  - `formatArtworkUrl(artwork, size)`: Replaces `{w}` and `{h}` placeholders with target dimensions.

### 2. Apple Music URL Parser (`lib/apple-music/url-parser.ts`)
- `parseAppleMusicUrl(url)`: Robust URL parser supporting:
  - Standard catalog playlists: `https://music.apple.com/:storefront/playlist/:name/:id` (e.g. `pl.f4d106fed2bd41149aaacabb233eb5eb`).
  - User and shared library playlists: `https://music.apple.com/:storefront/playlist/:name/pl.u-...`
  - Playlists without a name slug: `https://music.apple.com/:storefront/playlist/:id`.
  - Album tracks with `?i=:trackId` query parameter (resolves to type `'song'` and target song ID).
  - Album collections: `https://music.apple.com/:storefront/album/:name/:id` (resolves to type `'album'`).
  - Direct songs: `https://music.apple.com/:storefront/song/:name/:id`.
  - Strips query parameters, handles `beta.music.apple.com`, and falls back to default storefront when missing.
- `isAppleMusicUrl(url)`: Strict URL detection and validation.
- `extractPlaylistId(url)`: Extracts catalog `pl.xxx` and library `pl.u-xxx` IDs from URLs or raw ID strings.

### 3. Developer & User Token Manager (`lib/apple-music/token-manager.ts`)
- Server-side ES256 JWT generation using Node.js `crypto` with `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` (with PKCS#8 PEM normalization).
- In-memory token caching with TTL buffer (supports up to 180-day Apple MusicKit developer tokens).
- Browser `localStorage` helpers (`getStoredTokens`, `setStoredTokens`, `clearStoredTokens`) for `apple_music_dev_token`, `apple_music_user_token`, and `apple_music_storefront`.

### 4. Apple Music API Client (`lib/apple-music/client.ts`)
- Class `AppleMusicClient`:
  - Configurable developer token, user token, storefront (default `'us'`), and base URL (`https://api.music.apple.com/v1` or `https://amp-api.music.apple.com/v1`).
  - Auto-injects `Authorization: Bearer <devToken>` and `Music-User-Token: <userToken>`.
  - `getAllLibraryPlaylists`: Automatic pagination traversal for user playlists.
  - `getLibraryPlaylistTracks`: Paginates all tracks in a user playlist.
  - `getLibrarySongs`: Fetches user loved/saved library tracks.
  - `getCatalogPlaylist`: Retrieves catalog playlist metadata and relationship tracks with multi-page pagination.
  - `searchByIsrc`: Catalog search filtered by exact ISRC.
  - `searchSongs`: Query catalog tracks by title/artist keywords.
  - `createLibraryPlaylist`: Creates new user library playlist with attributes and track relationships.
  - `addTracksToLibraryPlaylist`: Adds tracks chunked into 100-track batches (Apple Music API limit).
  - `addSongToLibrary`: Saves catalog songs to personal library.
  - Detailed error handling with `AppleMusicApiError` preserving HTTP status and parsed error payloads.

### 5. Apple Music Adapter (`lib/providers/apple-music-adapter.ts`)
- Implements `SourceProvider` and `DestinationProvider` from `types/provider.ts`.
- Bidirectional conversions:
  - `toUnifiedTrack(appleSong): UnifiedTrack`
  - `toUnifiedPlaylist(applePlaylist, trackCount?, isLiked?): UnifiedPlaylist`
  - `toDestinationMatchCandidate(appleSong): DestinationMatchCandidate`
- `SourceProvider`:
  - `listPlaylists`: Library playlists via `client.getAllLibraryPlaylists`.
  - `getPlaylistTracks`: Playlist tracks via `client.getLibraryPlaylistTracks` (with special `'library-songs'` handling).
  - `getFavorites`: User library songs.
  - `canParseUrl`: Apple Music URL checking.
  - `getPublicPlaylist`: Public catalog playlist via route `/api/apple-music/public-playlist` or direct catalog fetch.
- `DestinationProvider`:
  - `searchByIsrc`: Direct ISRC catalog search.
  - `searchByQuery`: Combined title + artist with title-only fallback.
  - `createPlaylist`: Library playlist creation with batch addition.
  - `appendToPlaylist`: Batch track insertion.
  - `saveFavorites`: Adds songs to user library.

### 6. API Routes
- `app/api/apple-music/public-playlist/route.ts`:
  - Validates playlist URLs, checks server developer token, queries catalog playlist and tracks, and returns `{ playlist: UnifiedPlaylist, tracks: UnifiedTrack[] }`.
- `app/api/apple-music/developer-token/route.ts`:
  - Returns `{ developerToken: string }` if configured on server (503 if not configured).

### 7. Comprehensive Unit Tests
- `lib/apple-music/url-parser.test.ts`: 17 tests validating URLs, edge cases, parameters, and playlist ID extraction.
- `lib/apple-music/token-manager.test.ts`: 13 tests validating ES256 key normalization, cryptographic JWT signing and verification, caching, and storage.
- `lib/apple-music/client.test.ts`: 14 tests validating endpoints, pagination, headers, search, batching, and error handling.
- `lib/providers/apple-music-adapter.test.ts`: 22 tests validating data conversions, source methods, destination methods, and fallbacks.
- `app/api/apple-music/apple-music-api.test.ts`: 8 tests validating public playlist import route and developer token endpoint.

---

## Task 3 Completed Architecture & Documentation

### 1. Canonical Match Models (`types/matching.ts`)
- **`TrackMatch` Evolution**:
  - Evolved `TrackMatch` to canonically contain `track: UnifiedTrack` and `matchedSong?: DestinationMatchCandidate`.
  - Maintained complete backward compatibility by preserving optional legacy aliases:
    - `spotifyTrack?: SpotifyTrack`
    - `navidromeSong?: NavidromeSong`
    - `candidates?: DestinationMatchCandidate[]`
  - Populates canonical and legacy aliases simultaneously so existing components (e.g. `ResultsReport`, `Dashboard`, `PlaylistDetail`) continue to function without disruption.

### 2. Decoupled Matching Engine (`lib/matching/orchestrator.ts`)
- **`matchUnifiedTrack(destination: DestinationProvider, track: UnifiedTrack, options?, signal?)`**:
  - Provider-agnostic matching pipeline accepting any source `UnifiedTrack` and matching against any destination platform implementing `DestinationProvider` (Navidrome, Apple Music, Spotify, or future services).
  - Multi-tier resolution strategy:
    1. **ISRC Search**: Queries `destination.searchByIsrc(track.isrc)` when enabled. Evaluates exact ISRC matching and variant candidate comparison (normalized title, artist overlaps, duration proximity).
    2. **Query Search**: Queries `destination.searchByQuery({ title: track.title, artist: track.artists[0]?.name })`.
    3. **Query ISRC Verification**: Checks if candidates returned by query search match `track.isrc`.
    4. **Strict Candidate Matching**: Evaluates exact normalized title, normalized artist, and version mismatch protection against candidate pool.
    5. **Fuzzy Candidate Matching**: Evaluates Levenshtein similarity on normalized titles, multi-artist similarity, duration delta penalties, album similarity, version mismatch penalties, and artist gates.
    6. **Ambiguity & Unmatched Resolution**: Correctly classifies ambiguous candidates and unmatched tracks.
- **`matchUnifiedTracks(destination, tracks, options?, signal?)`**:
  - Iterates unified tracks with cancellation (`AbortSignal`) and error containment.
- **Backward Compatibility**:
  - `matchTrack(client: NavidromeApiClient, spotifyTrack: SpotifyTrack, ...)` preserved and populates both unified (`track`, `matchedSong`) and legacy (`spotifyTrack`, `navidromeSong`) fields.
  - Helper functions `getUnmatchedTracks`, `getMatchedTracks`, `getUnmatchedUnifiedTracks`, `getMatchedUnifiedTracks` provided for typed consumer access.

### 3. Decoupled Batch Matcher (`lib/matching/batch-matcher.ts`)
- **`UnifiedBatchMatcher` Interface & `DefaultUnifiedBatchMatcher`**:
  - `matchTracks(tracks: UnifiedTrack[], destination: DestinationProvider, options?, onProgress?)`:
    - Handles sequential or concurrent batch execution with chunking.
    - Emits progress updates containing `current`, `total`, `percent`, `matched`, `unmatched`, `currentUnifiedTrack`, and `currentTrack`.
    - Computes aggregated match statistics (`total`, `matched`, `ambiguous`, `unmatched`, `byStrategy`).
  - `matchTracksDifferential(tracks: UnifiedTrack[], destination: DestinationProvider, cachedTracks, options?, onProgress?)`:
    - Partitions tracks into cached vs new based on canonical track keys (`getUnifiedTrackKey`).
    - Only queries destination for new or uncached tracks, preserving cache performance.
    - Merges results preserving exact source order.
- **Backward Compatibility**:
  - `createBatchMatcher(spotifyClient, navidromeClient)` and `DefaultBatchMatcher` preserved with full type conformance.

### 4. Decoupled Playlist Exporter (`lib/export/playlist-exporter.ts`)
- **`UnifiedPlaylistExporter` Interface & `DefaultUnifiedPlaylistExporter`**:
  - Operates directly on any `DestinationProvider`:
    - `createPlaylist(name, trackIds, options?)`: Creates playlist with public visibility option.
    - `appendToPlaylist(playlistId, trackIds)`: Appends track IDs to existing playlist.
    - `exportPlaylist(playlistName, matches, options?)`:
      - Extracts matched track IDs from `matchedSong?.id || navidromeSong?.id`.
      - Supports export modes (`'create'`, `'append'`, `'overwrite'`, `'update'`).
      - Emits progress events (`preparing`, `completed`, `failed`).
      - Detailed error reporting and duration tracking.
- **Backward Compatibility**:
  - `createPlaylistExporter(navidromeClient)` and `DefaultPlaylistExporter` preserved for existing Navidrome workflows.

### 5. Multi-Provider Matching Unit Test Suite (`lib/matching/multi-provider-matching.test.ts`)
- 19 comprehensive unit tests verifying:
  - **Apple Music to Navidrome**: ISRC matching, strict title/artist matching, fuzzy matching on spelling variations, unmatched handling, ambiguous candidate disambiguation.
  - **Spotify to Apple Music**: ISRC matching against Apple Music catalog, query-based strict matching.
  - **Navidrome to Spotify**: ISRC matching, fuzzy title matching.
  - **Unified Batch Matcher**: Full array batch matching, progress callbacks, statistics aggregation, concurrency chunking, differential cache matching, abort cancellation.
  - **Unified Playlist Exporter**: Playlist creation on destination, playlist appending, empty match handling, destination error handling.
  - **Helper Utilities**: Candidate and track conversions, matched/unmatched extraction.

---

## Task 4 Completed Architecture & Documentation

### 1. Multi-Provider Authentication & Session State (`types/auth-context.ts`, `lib/auth/auth-context.tsx`)
- **`AppleMusicAuthState` Interface**:
  - `isConnected: boolean`: Connection status indicator.
  - `userToken: string | null`: Apple Music user/Music-User-Token (Web Session Token).
  - `developerToken: string | null`: Apple Music developer JWT token.
  - `storefront: string`: Storefront region code (default `"us"`).
  - `playlists: UnifiedPlaylist[]`: Cached library playlists.
  - `isLoading: boolean`: Loading and validation state.
  - `error: string | null`: Authentication error messages.
- **Provider Routing State**:
  - `activeSource: ProviderId` (defaults to `'spotify'`).
  - `activeDestination: ProviderId` (defaults to `'navidrome'`).
  - `setActiveSource(source: ProviderId)`: Updates source platform and syncs with `localStorage`.
  - `setActiveDestination(destination: ProviderId)`: Updates destination platform and syncs with `localStorage`.
- **Persistent Storage**:
  - `navispot_apple_music_auth`: Encoded session tokens, storefront, and playlist cache.
  - `navispot_active_source`: Preserves active source across page reloads.
  - `navispot_active_destination`: Preserves active destination across page reloads.
- **Session Actions**:
  - `connectAppleMusicWithTokens(userToken, developerToken?, storefront?)`: Validates and saves tokens, initializes client, fetches initial playlists, and persists to local storage. Automatically falls back to `/api/apple-music/developer-token` if a developer token is not provided.
  - `disconnectAppleMusic()`: Clears credentials and active Apple Music state.
  - `refreshAppleMusicPlaylists()`: Re-fetches user library playlists from Apple Music API.

### 2. Apple Music UI Components (`components/apple-music-credentials-modal.tsx`, `components/apple-music-connect-button.tsx`)
- **Material Design 3 & Clean UI Compliance (`frontend-m3-clean`)**:
  - Strict zero-emoji policy; uses Lucide vector icons (`Music`, `KeyRound`, `ExternalLink`, `ShieldCheck`, `CheckCircle2`, `Trash2`, `HelpCircle`, etc.).
  - Responsive dialog layout with clear elevation, surface tokens, and accessible contrast.
- **Dual-Mode Setup Modal (`components/apple-music-credentials-modal.tsx`)**:
  - **Community Mode ($0)**: Designed for zero-cost operation without requiring a paid Apple Developer Account ($99/yr). Explains how to extract the Music-User-Token from browser session storage on `music.apple.com`.
  - **Developer Mode**: Dedicated tab for developers with private keys, Key ID, Team ID, or direct Developer JWT tokens.
  - **Storefront Selector**: Regional storefront configuration supporting US, GB, CA, DE, FR, JP, AU, etc.
- **Connection Indicator (`components/apple-music-connect-button.tsx`)**:
  - Context-aware badge displaying current connection status and active storefront tag.
  - Action buttons to open credentials management modal, refresh library, or disconnect.

### 3. Soundiiz Transfer Header (`components/Dashboard/SoundiizTransferHeader.tsx`)
- **Visual Transfer Flow Layout**:
  - Displays transfer direction with responsive layout: `[Source Provider Cards] -> [Transfer Flow Indicator] -> [Destination Provider Cards]`.
  - Platform cards for Spotify, Apple Music, and Navidrome with brand badges, connection status pills, and live playlist counts.
- **Safety & Conflict Prevention**:
  - Prevents selecting identical source and destination platforms.
  - Disables the currently active source in the destination selector.
  - Automatically shifts destination to an alternative platform if the user selects the current destination as the new source.
- **Inline Connection Prompts**:
  - Selecting a disconnected provider (e.g. Apple Music before entering tokens) immediately prompts the user to connect via credentials modal.

### 4. Any-to-Any Transfer Engine in Dashboard (`components/Dashboard/Dashboard.tsx`)
- **Dynamic Source Playlist Loading**:
  - Spotify active: Loads Spotify Liked Songs, user playlists, and imported public playlists.
  - Apple Music active: Loads Apple Music library playlists, favorite tracks, and imported catalog playlists.
  - Navidrome active: Loads Navidrome server playlists.
- **State Isolation**:
  - Seamlessly resets playlist selections, match progress, and differential cache when `activeSource` changes.
- **Unified Track Fetching**:
  - Uses `sourceAdapter.getFavorites()` and `sourceAdapter.getPlaylistTracks()` to retrieve canonical `UnifiedTrack[]` from any active source platform.
- **Decoupled Matching & Export Pipeline**:
  - Instantiates `createUnifiedBatchMatcher()` and `createUnifiedPlaylistExporter(destAdapter)` using the active destination provider.
  - Full support for syncing to Navidrome, Apple Music, or Spotify.
  - Preserves Navidrome identity tracking comments (`navidrome:spotify_id:...` / `navidrome:spotify_matched_at:...`) when exporting to Navidrome.

### 5. Smart Search & Playlist Table Updates (`components/Dashboard/PlaylistTable.tsx`)
- **Dual Provider URL Detection**:
  - Recognizes Apple Music public playlist and song URLs (`music.apple.com/.../playlist/...`) as well as Spotify URLs (`open.spotify.com/playlist/...`).
  - Dispatches to appropriate provider import API.
- **Source Platform Badges**:
  - Badges on playlist rows display provider iconography (Lucide `Radio` for Spotify, `Music` for Apple Music, `Compass` for Navidrome).
- **React 19 Compatibility**:
  - Resolved compiler memoization issues on Popover and tooltip triggers.

### 6. Component Test Suite (`components/apple-music-ui.test.tsx`)
- 8 automated tests with 100% pass rate:
  - `AppleMusicConnectButton`: verifies disconnected state, connected state with storefront badge, and modal opening.
  - `AppleMusicCredentialsModal`: verifies tab switching, Community Mode token input and submit callback, Developer Mode input, and disconnect handler.
  - `SoundiizTransferHeader`: verifies rendering of all platforms, source selection changes, and disabled state for matching destination.


