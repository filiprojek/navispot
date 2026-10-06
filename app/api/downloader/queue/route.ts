import { NextRequest, NextResponse } from 'next/server';
import { DownloaderClient } from '@/lib/downloader/client';
import { QueueTrackRequest } from '@/types/downloader';

export async function POST(req: NextRequest) {
  let body: QueueTrackRequest & { url?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || body.id === undefined || body.id === null || body.id === '') {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  }

  const headerUrl = req.headers.get('x-downloader-url');
  const headerApiKey = req.headers.get('x-downloader-api-key');
  const queryUrl = req.nextUrl.searchParams.get('url');
  const queryApiKey = req.nextUrl.searchParams.get('apiKey');

  const url = (
    headerUrl ||
    queryUrl ||
    body.url ||
    process.env.DOWNLOADER_URL ||
    process.env.NEXT_PUBLIC_DOWNLOADER_URL ||
    'http://127.0.0.1:8787'
  ).trim();

  const apiKey = (
    headerApiKey ||
    queryApiKey ||
    body.apiKey ||
    process.env.DOWNLOADER_API_KEY ||
    process.env.NEXT_PUBLIC_DOWNLOADER_API_KEY ||
    'flacdownloader'
  ).trim();

  const client = new DownloaderClient({ url, apiKey }, { useProxy: false });

  try {
    const result = await client.queueTrack({
      id: body.id,
      title: body.title,
      artist: body.artist,
      album: body.album,
      format: body.format,
      type: body.type,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
