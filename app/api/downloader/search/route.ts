import { NextRequest, NextResponse } from 'next/server';
import { DownloaderClient } from '@/lib/downloader/client';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q');
  if (!q || !q.trim()) {
    return NextResponse.json({ error: 'Missing query parameter q' }, { status: 400 });
  }

  const limitParam = req.nextUrl.searchParams.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 30;

  const headerUrl = req.headers.get('x-downloader-url');
  const headerApiKey = req.headers.get('x-downloader-api-key');
  const queryUrl = req.nextUrl.searchParams.get('url');
  const queryApiKey = req.nextUrl.searchParams.get('apiKey');

  const url = (
    headerUrl ||
    queryUrl ||
    process.env.DOWNLOADER_URL ||
    process.env.NEXT_PUBLIC_DOWNLOADER_URL ||
    'http://127.0.0.1:8787'
  ).trim();

  const apiKey = (
    headerApiKey ||
    queryApiKey ||
    process.env.DOWNLOADER_API_KEY ||
    process.env.NEXT_PUBLIC_DOWNLOADER_API_KEY ||
    'flacdownloader'
  ).trim();

  const client = new DownloaderClient({ url, apiKey }, { useProxy: false });

  try {
    const tracks = await client.search(q, isNaN(limit) ? 30 : limit);
    return NextResponse.json(tracks);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Search failed',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 502 }
    );
  }
}
