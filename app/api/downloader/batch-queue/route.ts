import { NextRequest, NextResponse } from 'next/server';
import { DownloaderClient } from '@/lib/downloader/client';
import { DownloaderFormat } from '@/types/downloader';

export async function POST(req: NextRequest) {
  let body: {
    tracks: { title: string; artist: string; album?: string }[];
    format?: DownloaderFormat;
    url?: string;
    apiKey?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || !Array.isArray(body.tracks)) {
    return NextResponse.json({ error: 'Invalid tracks array' }, { status: 400 });
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

  const client = new DownloaderClient(
    {
      url,
      apiKey,
      format: body.format || 'flac',
    },
    { useProxy: false }
  );

  try {
    const result = await client.batchQueueMissingTracks(body.tracks);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Batch queue failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
