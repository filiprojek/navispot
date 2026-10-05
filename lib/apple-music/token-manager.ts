import type { AppleMusicAuthTokens } from './types';

export const APPLE_DEV_TOKEN_KEY = 'apple_music_dev_token';
export const APPLE_USER_TOKEN_KEY = 'apple_music_user_token';
export const APPLE_STOREFRONT_KEY = 'apple_music_storefront';

// Default token validity: 180 days (Apple MusicKit maximum is ~180 days / 15,777,000 seconds)
const DEFAULT_EXPIRATION_SECONDS = 180 * 24 * 60 * 60;
const EXPIRATION_BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer before expiry

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedServerToken: CachedToken | null = null;

function base64UrlEncode(data: string | Buffer): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  return buf.toString('base64url');
}

/**
 * Normalizes PEM private key strings, handling escaped newlines and missing headers.
 */
export function normalizePrivateKey(key: string): string {
  let normalized = key.trim();
  if (normalized.includes('\\n')) {
    normalized = normalized.replace(/\\n/g, '\n');
  }
  if (!normalized.includes('-----BEGIN PRIVATE KEY-----')) {
    normalized = `-----BEGIN PRIVATE KEY-----\n${normalized}\n-----END PRIVATE KEY-----`;
  }
  return normalized;
}

export interface GenerateTokenOptions {
  teamId?: string;
  keyId?: string;
  privateKey?: string;
  expiresInSeconds?: number;
}

/**
 * Generates an Apple Music Developer Token (ES256 JWT) signed with the developer's private key.
 * Uses Node.js crypto module.
 */
export function generateDeveloperToken(options: GenerateTokenOptions = {}): string {
  const teamId = options.teamId || process.env.APPLE_TEAM_ID;
  const keyId = options.keyId || process.env.APPLE_KEY_ID;
  const privateKey = options.privateKey || process.env.APPLE_PRIVATE_KEY;
  const expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRATION_SECONDS;

  if (!teamId || !keyId || !privateKey) {
    throw new Error(
      'Missing required Apple Developer credentials (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY)'
    );
  }

  // Node crypto import (safe for Next.js server runtime)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('crypto') as typeof import('crypto');

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;

  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  const payload = {
    iss: teamId,
    iat: now,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const formattedKey = normalizePrivateKey(privateKey);
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: formattedKey,
    dsaEncoding: 'ieee-p1363',
  });

  const encodedSignature = base64UrlEncode(signature);
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Returns the active Apple Music developer token:
 * 1. From explicit process.env.APPLE_DEVELOPER_TOKEN if present.
 * 2. From cached generated token if valid.
 * 3. Newly generated token using APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.
 * Returns null if credentials are not configured.
 */
export function getDeveloperToken(): string | null {
  if (process.env.APPLE_DEVELOPER_TOKEN) {
    return process.env.APPLE_DEVELOPER_TOKEN.trim();
  }

  const now = Date.now();
  if (cachedServerToken && now < cachedServerToken.expiresAt - EXPIRATION_BUFFER_MS) {
    return cachedServerToken.token;
  }

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;

  if (teamId && keyId && privateKey) {
    try {
      const expiresInSeconds = DEFAULT_EXPIRATION_SECONDS;
      const token = generateDeveloperToken({ teamId, keyId, privateKey, expiresInSeconds });
      cachedServerToken = {
        token,
        expiresAt: now + expiresInSeconds * 1000,
      };
      return token;
    } catch (err) {
      console.error('[AppleMusic TokenManager] Failed to generate developer token:', err);
      return null;
    }
  }

  return null;
}

/**
 * Check if Apple Music developer token credentials are configured on server.
 */
export function isDeveloperTokenConfigured(): boolean {
  return Boolean(
    process.env.APPLE_DEVELOPER_TOKEN ||
      (process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY)
  );
}

/**
 * Invalidate cached developer token (useful for testing or key rotation).
 */
export function clearCachedDeveloperToken(): void {
  cachedServerToken = null;
}

/**
 * Sets a custom cached developer token (useful for unit tests).
 */
export function setCachedDeveloperToken(token: string, expiresInSeconds: number): void {
  cachedServerToken = {
    token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };
}

// -------------------------------------------------------------
// Browser Storage Helpers (MusicKit user tokens & storefront)
// -------------------------------------------------------------

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

export function getStoredTokens(): AppleMusicAuthTokens {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  try {
    return {
      developerToken: storage.getItem(APPLE_DEV_TOKEN_KEY) || undefined,
      musicUserToken: storage.getItem(APPLE_USER_TOKEN_KEY) || undefined,
      storefront: storage.getItem(APPLE_STOREFRONT_KEY) || undefined,
    };
  } catch {
    return {};
  }
}

export function setStoredTokens(tokens: Partial<AppleMusicAuthTokens>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (tokens.developerToken !== undefined) {
      if (tokens.developerToken) {
        storage.setItem(APPLE_DEV_TOKEN_KEY, tokens.developerToken);
      } else {
        storage.removeItem(APPLE_DEV_TOKEN_KEY);
      }
    }
    if (tokens.musicUserToken !== undefined) {
      if (tokens.musicUserToken) {
        storage.setItem(APPLE_USER_TOKEN_KEY, tokens.musicUserToken);
      } else {
        storage.removeItem(APPLE_USER_TOKEN_KEY);
      }
    }
    if (tokens.storefront !== undefined) {
      if (tokens.storefront) {
        storage.setItem(APPLE_STOREFRONT_KEY, tokens.storefront);
      } else {
        storage.removeItem(APPLE_STOREFRONT_KEY);
      }
    }
  } catch {
    // Ignore storage quota or access errors
  }
}

export function clearStoredTokens(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(APPLE_DEV_TOKEN_KEY);
    storage.removeItem(APPLE_USER_TOKEN_KEY);
    storage.removeItem(APPLE_STOREFRONT_KEY);
  } catch {
    // Ignore
  }
}
