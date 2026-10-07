import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/auth';
import { serializeMe } from '@/lib/serialize';

/** GET /api/me — the signed-in user, created in the DB on first call if the webhook hasn't yet. */
export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;
  return NextResponse.json(serializeMe(user));
}
