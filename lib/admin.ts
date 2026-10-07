import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { notFound, redirect } from 'next/navigation';

import { ensureUser } from '@/lib/users';

/**
 * Gate for admin pages and server actions. Admin is a role in OUR database (never granted
 * automatically); non-admins get a 404 so the dashboard doesn't advertise itself.
 */
export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const user = await ensureUser(userId);
  if (user.status !== 'ACTIVE' || !user.roles.includes('ADMIN')) notFound();
  return user;
}
