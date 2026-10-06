import { NextRequest, NextResponse } from 'next/server';
import { DownloaderClient } from '@/lib/downloader/client';

export async function GET(req: NextRequest) {
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
  const status = await client.checkStatus();

  return NextResponse.json(status);
}
