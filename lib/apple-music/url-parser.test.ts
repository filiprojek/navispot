import { describe, it, expect } from 'vitest';
import {
  parseAppleMusicUrl,
  isAppleMusicUrl,
  extractPlaylistId,
} from './url-parser';

describe('Apple Music URL Parser', () => {
  describe('parseAppleMusicUrl', () => {
    it('parses standard catalog playlist URLs', () => {
      const url =
        'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'us',
        type: 'playlist',
        id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
        name: 'todays-hits',
      });
    });

    it('parses user/shared library playlist URLs with pl.u- prefix', () => {
      const url =
        'https://music.apple.com/gb/playlist/summer-vibes-2024/pl.u-7642vXmsW5xR7M';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'gb',
        type: 'playlist',
        id: 'pl.u-7642vXmsW5xR7M',
        name: 'summer-vibes-2024',
      });
    });

    it('parses playlist URLs without a name slug', () => {
      const url =
        'https://music.apple.com/us/playlist/pl.f4d106fed2bd41149aaacabb233eb5eb';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'us',
        type: 'playlist',
        id: 'pl.f4d106fed2bd41149aaacabb233eb5eb',
        name: undefined,
      });
    });

    it('parses beta.music.apple.com URLs', () => {
      const url = 'https://beta.music.apple.com/fr/playlist/chill-mix/pl.abc123';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'fr',
        type: 'playlist',
        id: 'pl.abc123',
        name: 'chill-mix',
      });
    });

    it('parses album URLs without song track param as album type', () => {
      const url = 'https://music.apple.com/us/album/abbey-road/401186200';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'us',
        type: 'album',
        id: '401186200',
        name: 'abbey-road',
      });
    });

    it('parses album URLs with ?i= track param as song type', () => {
      const url =
        'https://music.apple.com/us/album/abbey-road/401186200?i=401186204';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'us',
        type: 'song',
        id: '401186204',
        name: 'abbey-road',
      });
    });

    it('parses direct song URLs', () => {
      const url = 'https://music.apple.com/us/song/anti-hero/1649492161';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'us',
        type: 'song',
        id: '1649492161',
        name: 'anti-hero',
      });
    });

    it('handles URLs without explicit https schema and ignores extra query parameters', () => {
      const url =
        'music.apple.com/jp/playlist/j-pop-now/pl.987654?l=en-US&app=music';
      const result = parseAppleMusicUrl(url);

      expect(result).toEqual({
        storefront: 'jp',
        type: 'playlist',
        id: 'pl.987654',
        name: 'j-pop-now',
      });
    });

    it('returns null for non-Apple Music URLs', () => {
      expect(
        parseAppleMusicUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBeNull();
      expect(
        parseAppleMusicUrl('https://www.youtube.com/playlist?list=PL12345')
      ).toBeNull();
      expect(parseAppleMusicUrl('https://google.com')).toBeNull();
    });

    it('returns null for empty or invalid inputs', () => {
      expect(parseAppleMusicUrl('')).toBeNull();
      expect(parseAppleMusicUrl('   ')).toBeNull();
      expect(parseAppleMusicUrl('not a url')).toBeNull();
      expect(parseAppleMusicUrl('https://music.apple.com/')).toBeNull();
      expect(parseAppleMusicUrl('https://music.apple.com/us/')).toBeNull();
      expect(parseAppleMusicUrl('https://music.apple.com/us/artists/drake')).toBeNull();
    });
  });

  describe('isAppleMusicUrl', () => {
    it('returns true for valid Apple Music URLs', () => {
      expect(
        isAppleMusicUrl('https://music.apple.com/us/playlist/todays-hits/pl.123')
      ).toBe(true);
      expect(
        isAppleMusicUrl('https://music.apple.com/ca/album/some-album/456?i=789')
      ).toBe(true);
    });

    it('returns false for Spotify, Navidrome, and invalid URLs', () => {
      expect(
        isAppleMusicUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBe(false);
      expect(isAppleMusicUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(false);
      expect(isAppleMusicUrl('https://navidrome.example.com')).toBe(false);
      expect(isAppleMusicUrl('')).toBe(false);
    });
  });

  describe('extractPlaylistId', () => {
    it('extracts playlist ID from catalog playlist URLs', () => {
      const url =
        'https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb';
      expect(extractPlaylistId(url)).toBe('pl.f4d106fed2bd41149aaacabb233eb5eb');
    });

    it('extracts playlist ID from user library playlist URLs', () => {
      const url =
        'https://music.apple.com/us/playlist/my-jam/pl.u-7642vXmsW5xR7M?l=en';
      expect(extractPlaylistId(url)).toBe('pl.u-7642vXmsW5xR7M');
    });

    it('returns the ID directly when given a raw playlist ID', () => {
      expect(extractPlaylistId('pl.f4d106fed2bd41149aaacabb233eb5eb')).toBe(
        'pl.f4d106fed2bd41149aaacabb233eb5eb'
      );
      expect(extractPlaylistId('pl.u-7642vXmsW5xR7M')).toBe(
        'pl.u-7642vXmsW5xR7M'
      );
    });

    it('returns null for non-playlist Apple Music URLs', () => {
      expect(
        extractPlaylistId('https://music.apple.com/us/album/abbey-road/401186200')
      ).toBeNull();
      expect(
        extractPlaylistId('https://music.apple.com/us/song/anti-hero/1649492161')
      ).toBeNull();
    });

    it('returns null for invalid strings', () => {
      expect(extractPlaylistId('')).toBeNull();
      expect(extractPlaylistId('not-a-playlist')).toBeNull();
      expect(
        extractPlaylistId('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
      ).toBeNull();
    });
  });
});
