import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { ensureUser } from '@/lib/users';

export type ApiUser = Awaited<ReturnType<typeof ensureUser>>;

/**
 * Resolves the signed-in user for an API route. The mobile app sends its Clerk session token as
 * `Authorization: Bearer <token>`; Clerk verifies it (signature, expiry) in `auth()`.
 * Returns either the user or a ready-made error response.
 */
export async function requireUser(): Promise<
  { user: ApiUser; response?: never } | { user?: never; response: NextResponse }
> {
  const { userId } = await auth();
  if (!userId) {
    return { response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const user = await ensureUser(userId);
  if (user.status !== 'ACTIVE') {
    return { response: NextResponse.json({ error: 'account_inactive' }, { status: 403 }) };
  }
  return { user };
}
