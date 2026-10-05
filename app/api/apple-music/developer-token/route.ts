import { NextResponse } from 'next/server';
import { getDeveloperToken } from '@/lib/apple-music/token-manager';

export async function GET() {
  const token = getDeveloperToken();
  if (!token) {
    return NextResponse.json(
      {
        error: {
          code: 'not_configured',
          message:
            'Apple Music developer token is not configured on server. Provide APPLE_DEVELOPER_TOKEN or APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.',
        },
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ developerToken: token });
}
