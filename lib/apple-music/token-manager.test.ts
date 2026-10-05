import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  generateDeveloperToken,
  getDeveloperToken,
  isDeveloperTokenConfigured,
  clearCachedDeveloperToken,
  setCachedDeveloperToken,
  normalizePrivateKey,
  getStoredTokens,
  setStoredTokens,
  clearStoredTokens,
} from './token-manager';

describe('Apple Music Token Manager', () => {
  // Generate a valid test EC key pair for ES256
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APPLE_DEVELOPER_TOKEN;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY;
    clearCachedDeveloperToken();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    clearCachedDeveloperToken();
  });

  describe('normalizePrivateKey', () => {
    it('handles PEM key with standard formatting', () => {
      const normalized = normalizePrivateKey(privateKeyPem);
      expect(normalized).toContain('-----BEGIN PRIVATE KEY-----');
      expect(normalized).toContain('-----END PRIVATE KEY-----');
    });

    it('handles escaped newlines in string', () => {
      const escaped = privateKeyPem.replace(/\n/g, '\\n');
      const normalized = normalizePrivateKey(escaped);
      expect(normalized).toContain('-----BEGIN PRIVATE KEY-----');
      expect(normalized).not.toContain('\\n');
    });

    it('adds missing headers if raw key body provided', () => {
      const stripped = privateKeyPem
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .trim();
      const normalized = normalizePrivateKey(stripped);
      expect(normalized).toContain('-----BEGIN PRIVATE KEY-----');
      expect(normalized).toContain('-----END PRIVATE KEY-----');
    });
  });

  describe('generateDeveloperToken', () => {
    it('generates a valid ES256 signed JWT', () => {
      const token = generateDeveloperToken({
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        privateKey: privateKeyPem,
        expiresInSeconds: 3600,
      });

      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts.length).toBe(3);

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      expect(header).toEqual({
        alg: 'ES256',
        kid: 'KEY1234567',
      });

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      expect(payload.iss).toBe('TEAM123456');
      expect(payload.exp).toBeGreaterThan(payload.iat);

      // Verify the cryptographic signature using the corresponding public key
      const signingInput = `${parts[0]}.${parts[1]}`;
      const signatureBuf = Buffer.from(parts[2], 'base64url');
      const verified = crypto.verify(
        'sha256',
        Buffer.from(signingInput),
        {
          key: publicKeyPem,
          dsaEncoding: 'ieee-p1363',
        },
        signatureBuf
      );
      expect(verified).toBe(true);
    });

    it('throws when required options are missing', () => {
      expect(() =>
        generateDeveloperToken({
          teamId: 'TEAM123',
          // keyId missing
          privateKey: privateKeyPem,
        })
      ).toThrow();
    });
  });

  describe('getDeveloperToken and caching', () => {
    it('returns APPLE_DEVELOPER_TOKEN when set in environment', () => {
      process.env.APPLE_DEVELOPER_TOKEN = 'static-jwt-token-123';
      expect(getDeveloperToken()).toBe('static-jwt-token-123');
    });

    it('generates and caches token from APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY', () => {
      process.env.APPLE_TEAM_ID = 'TEAM123';
      process.env.APPLE_KEY_ID = 'KEY456';
      process.env.APPLE_PRIVATE_KEY = privateKeyPem;

      const token1 = getDeveloperToken();
      expect(token1).not.toBeNull();

      // Subsequent call should hit cache (same token string)
      const token2 = getDeveloperToken();
      expect(token2).toBe(token1);
    });

    it('returns null if environment variables are not set', () => {
      expect(getDeveloperToken()).toBeNull();
    });

    it('supports manually setting cached token', () => {
      setCachedDeveloperToken('manual-token-789', 3600);
      expect(getDeveloperToken()).toBe('manual-token-789');
    });
  });

  describe('isDeveloperTokenConfigured', () => {
    it('returns true when APPLE_DEVELOPER_TOKEN is set', () => {
      process.env.APPLE_DEVELOPER_TOKEN = 'token';
      expect(isDeveloperTokenConfigured()).toBe(true);
    });

    it('returns true when all 3 dynamic key variables are set', () => {
      process.env.APPLE_TEAM_ID = 'TEAM';
      process.env.APPLE_KEY_ID = 'KEY';
      process.env.APPLE_PRIVATE_KEY = 'KEY_BODY';
      expect(isDeveloperTokenConfigured()).toBe(true);
    });

    it('returns false when missing variables', () => {
      process.env.APPLE_TEAM_ID = 'TEAM';
      expect(isDeveloperTokenConfigured()).toBe(false);
    });
  });

  describe('Browser Storage Helpers', () => {
    const mockStorage: Record<string, string> = {};

    beforeEach(() => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      });
      vi.stubGlobal('window', {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('saves, retrieves, and clears tokens from localStorage', () => {
      setStoredTokens({
        developerToken: 'dev-tok',
        musicUserToken: 'user-tok',
        storefront: 'us',
      });

      const tokens = getStoredTokens();
      expect(tokens).toEqual({
        developerToken: 'dev-tok',
        musicUserToken: 'user-tok',
        storefront: 'us',
      });

      clearStoredTokens();
      expect(getStoredTokens()).toEqual({});
    });
  });
});
