import { NextRequest, NextResponse } from 'next/server';
import { parseAppleMusicUrl } from '@/lib/apple-music/url-parser';
import { getDeveloperToken } from '@/lib/apple-music/token-manager';
import { AppleMusicClient, AppleMusicApiError } from '@/lib/apple-music/client';
import { toUnifiedPlaylist, toUnifiedTrack } from '@/lib/providers/apple-music-adapter';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return err('invalid_url', 'Invalid JSON body', 400);
  }

  const url = body.url ?? '';
  const parsed = parseAppleMusicUrl(url);

  if (!parsed || parsed.type !== 'playlist') {
    return err(
      'invalid_url',
      "That doesn't look like an Apple Music playlist URL. Expected something like https://music.apple.com/us/playlist/...",
      400
    );
  }

  const developerToken = getDeveloperToken();
  if (!developerToken) {
    return err(
      'apple_music_not_configured',
      'Apple Music developer credentials are not configured on the server. Set APPLE_DEVELOPER_TOKEN or APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.',
      503
    );
  }

  try {
    const client = new AppleMusicClient({
      developerToken,
      storefront: parsed.storefront,
    });

    const { playlist, tracks } = await client.getCatalogPlaylist(
      parsed.storefront,
      parsed.id
    );

    const unifiedPlaylist = toUnifiedPlaylist(playlist, tracks.length);
    const unifiedTracks = tracks.map(toUnifiedTrack);

    return NextResponse.json({
      playlist: unifiedPlaylist,
      tracks: unifiedTracks,
    });
  } catch (e) {
    if (e instanceof AppleMusicApiError) {
      if (e.status === 404) {
        return err(
          'private_or_missing',
          "This playlist is private, catalog-restricted, or doesn't exist. Check that the storefront matches where the playlist was created.",
          404
        );
      }
      if (e.status === 401 || e.status === 403) {
        return err(
          'apple_music_error',
          'Apple Music rejected server developer credentials.',
          502
        );
      }
    }
    console.error('[apple-music/public-playlist] unexpected error:', e);
    return err(
      'internal_error',
      e instanceof Error ? e.message : 'Unknown error',
      500
    );
  }
}
